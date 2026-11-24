import { Script, Widget, fetch } from "scripting"
import { widgetKey, widgetOverview, type WidgetOverview } from "./widget-data"
import resources from "./resources"
import { presentBoard } from "./present"

type Message = { action: string, [key: string]: any }
type SessionCookie = {
  name: string, value: string, path?: string, isSecure?: boolean, expiresDate?: Date | null
}
const sessions = new Map<string, Map<string, SessionCookie>>()
const prefix = "cmodem."
const profileKey = "LAN_PROFILES_V1"
const wifiPrefix = "UPSTREAM_LOCAL_WIFI_CACHE_"
const js = (value: unknown) => JSON.stringify(value).replace(/</g, "\\u003c")
const policy = '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; script-src \'unsafe-inline\' \'unsafe-eval\'; style-src \'unsafe-inline\'; img-src data: blob:; font-src data:; form-action \'none\'; base-uri \'none\'">'

async function requestDevice(message: Message) {
  const {origin, url, path, secure, options} = message
  let jar = sessions.get(origin)
  if (!jar) {
    jar = new Map()
    sessions.set(origin, jar)
  }
  const matches = Array.from(jar.values()).filter(cookie => {
    const scope = cookie.path || "/"
    return (!cookie.isSecure || secure) && (!cookie.expiresDate || +new Date(cookie.expiresDate) > Date.now())
      && (scope === path || path.startsWith(scope.endsWith("/") ? scope : scope + "/"))
  }).sort((a, b) => (b.path || "/").length - (a.path || "/").length)
  const headers = {...options.headers}
  if (matches.length && !Object.keys(headers).some(key => key.toLowerCase() === "cookie"))
    headers.Cookie = matches.map(c => c.name + "=" + c.value).join("; ")
  try {
    const response = await fetch(url, {
      method: options.method || "GET", headers, body: options.body,
      timeout: Math.min(45, Math.max(1, (options.timeoutMs || 45000) / 1000)),
      handleRedirect: async () => null,
    })
    for (const cookie of response.cookies || []) {
      const key = (cookie.path || "/") + "\n" + cookie.name
      if (cookie.expiresDate && +new Date(cookie.expiresDate) <= Date.now()) jar.delete(key)
      else jar.set(key, cookie)
    }
    return {status: response.status, text: await response.text()}
  } catch (error) {
    return {status: 0, text: "连接失败，请检查设备地址、Wi-Fi 和 Scripting 的本地网络权限。" + String(error)}
  }
}

async function run() {
  const core = new WebViewController({ephemeral: true})
  const board = new WebViewController({ephemeral: true})
  const base = "https://fhcpeboard.local/"
  const values: Record<string, string> = Object.create(null)
  let visible = false
  let closeBoard = () => {}
  let preferenceWrite: Promise<unknown> = Promise.resolve()
  let lastWidgetReload = 0
  let widgetProfile = {id:"", name:""}
  function reloadWidget() {
    lastWidgetReload = Date.now()
    void Promise.resolve(Widget.reloadAll()).catch(() => {})
  }
  function selectWidgetProfile(raw: string) {
    let account
    try {
      const saved = JSON.parse(raw || "{}")
      account = saved.profiles?.find((p: {id:string}) => p.id === saved.activeId)
    } catch { return }
    widgetProfile = {id:account?.id || "", name:account?.nameCustom ? account.name : ""}
    const prior = Storage.get<WidgetOverview>(widgetKey)
    if (!widgetProfile.id) {
      if (prior) { Storage.remove(widgetKey); reloadWidget() }
    } else if (prior?.id !== widgetProfile.id) {
      Storage.set(widgetKey, widgetOverview(widgetProfile.id, widgetProfile.name, {}, 0))
      reloadWidget()
    }
  }
  function write(key: string, value: string) {
    if (!Keychain.set(prefix + key, value) || ((key === profileKey || key.endsWith("_HOME_CARDS_") || key.endsWith("_SMS_TAB_")) && Keychain.get(prefix + key) !== value))
      throw Error("配置未保存，写入钥匙串失败。请重试。")
    values[key] = value
    if (key === profileKey) selectWidgetProfile(value)
  }
  function remove(key: string) {
    if (Keychain.contains(prefix + key) && !Keychain.remove(prefix + key)) throw Error("无法移除设备配置")
    delete values[key]
  }
  try {
    for (const key of Keychain.keys()) {
      if (key.startsWith(prefix) && key !== prefix + profileKey) values[key.slice(prefix.length)] = Keychain.get(key) || ""
    }
    const saved = Keychain.get(prefix + profileKey)
    selectWidgetProfile(saved || "")
    if (saved != null) values[profileKey] = saved
    const preferenceKeys = ["UPSTREAM_LOCAL_HOME_CARDS_"]
    if (saved) {
      let profiles
      try { profiles = JSON.parse(saved).profiles } catch { profiles = [] }
      for (const p of Array.isArray(profiles) ? profiles : [])
        preferenceKeys.push("UPSTREAM_LOCAL_DEVICE_" + encodeURIComponent(p.host+"|"+(p.username||p.user||"")) + "_UPSTREAM_LOCAL_SMS_TAB_")
    }
    for (const key of preferenceKeys) {
      const value = Keychain.get(prefix + key)
      if (value != null) values[key] = value
    }
    for (const controller of [core, board])
      controller.shouldAllowRequest = async request => request.url === base || request.url === "about:blank"
    await core.setSettings({inactiveSchedulingPolicy: "none"})
    await board.addScriptMessageHandler("board", async (message: Message) => {
      if (message.action === "close") { await preferenceWrite; closeBoard() }
      if (message.action === "wifi") write(wifiPrefix + message.scope, message.value)
      if (message.action === "page") {
        const action = JSON.parse(message.json).action
        if (action === "setHomeCards" || action === "smsTab") {
          const write = preferenceWrite.then(() => core.evaluateJavaScript("return window.__saveBoardPreference(" + js(message.json) + ")"))
          preferenceWrite = write.catch(() => {})
          try { await write } catch { await Dialog.alert({title:"Cmodem", message:"设置未保存，请重试。"}) }
        } else await core.evaluateJavaScript("void window.__onPageMessage(" + js(message.json) + ")")
      }
      return null
    })
    await core.addScriptMessageHandler("device", async (message: Message) => {
      switch (message.action) {
        case "widgetSample": {
          if (!widgetProfile.id || message.id !== widgetProfile.id) break
          const now = Date.now()
          const prior = Storage.get<WidgetOverview>(widgetKey)
          if (Storage.set(widgetKey, widgetOverview(message.id, widgetProfile.name, message.sample, now))
              && (!prior?.sampledAt || now-lastWidgetReload >= 15*60*1000)) reloadWidget()
          break
        }
        case "fetch": return requestDevice(message)
        case "clearSession": sessions.delete(message.origin); break
        case "set": write(message.key, message.value); break
        case "remove": remove(message.key); break
        case "clearCaches":
          for (const key of Object.keys(values)) if (/CACHE|CACHED_DATA/i.test(key)) remove(key)
          await board.evaluateJavaScript("for (const k of Object.keys(window.__cmodemWifi)) delete window.__cmodemWifi[k]")
          break
        case "eval": {
          const code = /^\s*return\b/.test(message.js) ? "(function(){"+message.js+"})()" : message.js
          const result = await board.evaluateJavaScript("return (0,eval)(" + js(code) + ")")
          return result ?? null
        }
        case "load": {
          const wifi = Object.fromEntries(Object.entries(values).filter(([k]) => k.startsWith(wifiPrefix))
            .map(([k,v]) => [k.slice(wifiPrefix.length), v]))
          const bridge = "<script>window.__cmodemVersion=" + js(resources.version) +
            ";window.__cmodemWifi=" + js(wifi) + ";\n" + resources.boardBridge + "</script>"
          const html = message.html.replace(/<head\b[^>]*>/i, (head: string) => head + policy + bridge)
          if (!await board.loadHTML(html, base)) throw Error("无法加载管理界面")
          visible = true
          break
        }
        case "error":
          await Dialog.alert({title: "Cmodem", message: String(message.text)})
          break
      }
      return null
    })
    const initial = "<script>window.__cmodemValues=" + js(values)
      + ";window.__cmodemAssets=" + js(resources.assets) + ";</script>"
    if (!await core.loadHTML("<!doctype html><html><head>" + policy + "</head><body>" +
      initial + resources.coreScripts + "</body></html>", base)) throw Error("设备管理引擎启动失败")
    // loadHTML resolves after navigation. The board load is initiated by an asynchronous handler.
    for (let attempt = 0; !visible && attempt < 150; attempt++)
      await new Promise(resolve => setTimeout(() => resolve(null), 100))
    if (!visible) throw Error("管理界面启动超时，请检查 Scripting 版本")
    await presentBoard(board, dismiss => { closeBoard = dismiss })
  } finally {
    core.dispose()
    board.dispose()
    sessions.clear()
  }
}

run().catch(error => Dialog.alert({title: "Cmodem", message: String(error)})).finally(() => Script.exit())
