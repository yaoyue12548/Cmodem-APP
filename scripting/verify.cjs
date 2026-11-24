// Generate an offline browser smoke test from the exact files in the import package.
const {execFileSync} = require('node:child_process')
const {stripTypeScriptTypes} = require('node:module')
const {writeFileSync} = require('node:fs')
const [bundle, output] = process.argv.slice(2)
const entry = name => execFileSync('tar', ['-xOf', bundle, name], {encoding:'utf8', maxBuffer:8e6})
const resources = entry('resources.ts').replace(/^export default /, 'const resources = ')
const host = stripTypeScriptTypes(entry('index.tsx').replace(/^import .*$/gm,''))
const presenter = entry('present.tsx')
if (!presenter.includes('modalPresentationStyle: "fullScreen"') || !presenter.includes('<WebView controller={controller}'))
  throw Error('Expected an embedded fullscreen WebView')

function simulator() {
  const views = [], errors = [], results = []
  const assert = (condition, label) => { if (!condition) throw Error(label); results.push(label) }
  const delay = ms => new Promise(resolve => setTimeout(resolve, ms))
  let launched = 0, failWrite = false
  window.Script = {exit: () => {
    if (!errors.length && launched === 1) {
      const saved = JSON.parse(keys.get(profileKey))
      for (const user of ['second','third'])
        saved.profiles.push({...saved.profiles[0], id:'fixture-'+user, username:user, name:user})
      keys.set(profileKey, JSON.stringify(saved))
      run().catch(e => errors.push(String(e))).finally(() => Script.exit())
      return
    }
    document.body.textContent = errors.length ? 'FAIL '+errors.join(' | ') : 'PASS '+results.join(' | ')
  }}
  window.Dialog = {alert: async value => errors.push(value.message)}
  const keys = new Map()
  const profileKey = 'cmodem.LAN_PROFILES_V1'
  window.Keychain = {keys: () => [...keys.keys()].filter(k => k !== profileKey), get: k => keys.get(k),
    set: (k,v) => !(failWrite && k === profileKey) && !!keys.set(k,v), contains: k => keys.has(k), remove: k => keys.delete(k)}
  const requests = []
  const signIns = []
  const mockOrigin = 'http://192.168.10.1'
  const fixturePassword = 'fake-only-<&>'
  let dismissals = 0
  window.presentBoard = async (board, onReady) => { launched++; onReady(() => { dismissals++ }); await board.inspect() }
  window.fetch = async (url, options) => {
    requests.push(options)
    if (url.startsWith(mockOrigin)) {
      if (url.endsWith('/cgi-bin/luci/')) signIns.push(options.body)
      const body = url.endsWith('cmodem-home.js') ? 'get_device_info admin/modem/cmodem/api get_bandinfo' :
        JSON.stringify({device_info:{model:'Air6'}, result:0})
      return {status:200,cookies:[],text:async()=>body}
    }
    return {status:302, cookies:[{name:'sysauth',value:'test-only',path:'/cgi-bin/'}], text:async()=>''}
  }
  window.WebViewController = class {
    constructor() {
      this.frame = document.createElement('iframe')
      document.body.appendChild(this.frame)
      this.handlers = {}
      views.push(this)
    }
    async setSettings() {}
    async addScriptMessageHandler(name, callback) { this.handlers[name] = {postMessage: callback} }
    async loadHTML(html) {
      const w = this.frame.contentWindow
      w.document.open()
      w.webkit = {messageHandlers:this.handlers}
      w.addEventListener('error', e => errors.push(e.message))
      w.document.write(html)
      w.document.close()
      return true
    }
    evaluateJavaScript(code) {
      const view = this.frame.contentWindow
      return Promise.resolve(view.Function(code)())
    }
    dispose() { this.frame.remove() }
    async inspect() {
      const core = views.at(-2).frame.contentWindow, board = this.frame.contentWindow
      const el = id => board.document.getElementById(id)
      const until = async predicate => { for(let i=0;i<250 && !predicate();i++) await delay(10); return predicate() }
      function drag(dx, dy) {
        const target = el('hcDeviceImg')
        for (const type of ['touchstart','touchmove','touchend']) {
          const point = new board.Touch({identifier:1,target,clientX:120+(type==='touchstart'?0:dx),clientY:100+(type==='touchstart'?0:dy)})
          target.dispatchEvent(new board.TouchEvent(type,{bubbles:true,cancelable:true,touches:type==='touchend'?[]:[point],changedTouches:[point]}))
        }
      }
      if (launched === 2) {
        assert(await until(() => signIns.length === 2), 'cold start automatically logs in')
        assert(signIns.every(v => v === 'luci_username=root&luci_password='+encodeURIComponent(fixturePassword)), 'restored credentials sent to saved address')
        board.openLocalLoginModal()
        assert(await until(() => el('localHost').value === mockOrigin && el('localUser').value === 'root' && el('localPass').value === fixturePassword), 'saved form restored in new WebViews')
        board.closeLocalLoginModal()
        drag(-12,0)
        drag(-50,90)
        for (const [dx, user] of [[-80,'second'],[80,'root'],[80,'third'],[-80,'root']]) {
          const before = signIns.length
          drag(dx,2)
          drag(dx,2)
          assert(await until(() => {
            const saved=JSON.parse(keys.get(profileKey))
            return saved.profiles.find(p=>p.id===saved.activeId)?.username===user &&
              el('localUser').value===user && !el('localUser').disabled
          }), 'swipe connects to '+user)
          assert(signIns.length===before+1 && signIns.at(-1).startsWith('luci_username='+user+'&'), 'one login per switch')
          assert(!el('localLoginModal').classList.contains('active'), 'overview stays visible')
        }
        assert(signIns.length===6, 'short and vertical drags ignored')
        return
      }
      for (let i=0; i<100 && !board.document.querySelector('#localLoginModal.active'); i++) await delay(10)
      assert(board.document.querySelector('#localLoginModal.active'), 'first-run login form')
      assert(board.AndroidBoard && typeof board.loginLocalAccount === 'function', 'board bridge')
      const pdu = core.AndroidCore.decodeSmsPdu
      assert(JSON.parse(pdu('00000491214300086211219080700004004F004B')).text === 'OK', 'UCS2 PDU')
      assert(JSON.parse(pdu('00000491214300086211219080700004D83DDE00')).text === '😀', 'surrogate pair PDU')
      assert(JSON.parse(pdu('00000491214300006211219080700005E8329BFD06')).text === 'hello', 'GSM7 PDU')
      const base = 'http://192.168.1.1'
      await core.__nfetch(base+'/cgi-bin/luci/', {method:'POST',body:'test'})
      await core.__nfetch(base+'/cgi-bin/luci/admin')
      assert(requests.at(-1).headers.Cookie === 'sysauth=test-only', 'login cookie replay')
      await core.__nfetch(base+'/unrelated')
      assert(!requests.at(-1).headers.Cookie, 'cookie path isolation')
      await core.AndroidCore.clearHttpSession(base)
      await core.__nfetch(base+'/cgi-bin/luci/')
      assert(!requests.at(-1).headers.Cookie, 'new session clears cookies')
      assert(typeof board.lanGlobalRefresh === 'function' && typeof core.LanProtocol.LanApi === 'function', 'runtime ready')
      const close = el('cmodemClose')
      assert(close?.parentElement === el('boardBottomBar') && close.getAttribute('aria-label') === '关闭脚本', 'exit beside bottom tabs')
      const tabBounds = board.document.querySelector('.tabbar').getBoundingClientRect()
      const exitBounds = close.getBoundingClientRect()
      assert(exitBounds.height === tabBounds.height && exitBounds.width === exitBounds.height, 'round exit matches menu height')
      const menuStyle = board.getComputedStyle(board.document.querySelector('.tabbar'))
      const exitStyle = board.getComputedStyle(close)
      assert(menuStyle.backgroundColor === exitStyle.backgroundColor && menuStyle.boxShadow === exitStyle.boxShadow, 'matching menu and exit surfaces')
      assert(exitBounds.left > tabBounds.right && exitBounds.right <= board.innerWidth && exitBounds.width >= 44, 'exit fits beside tabs')
      for (const [id,value] of [['localHost',mockOrigin],['localUser','root'],['localPass',fixturePassword]]) {
        el(id).value=value
        el(id).dispatchEvent(new board.Event('input'))
      }
      const login = board.document.querySelector('[onclick="loginLocalAccount()"]')
      failWrite = true
      login.click()
      assert(await until(() => el('localTestMsg').textContent.includes('未保存')), 'failed write is reported')
      assert(!keys.has(profileKey) && !signIns.length, 'failed save does not log in')
      failWrite = false
      login.click()
      assert(await until(() => signIns.length === 1), 'save and log in via actual button')
      assert(JSON.parse(keys.get(profileKey)).profiles[0].password === fixturePassword, 'saved profile verified')
      await until(() => !el('localLoginModal').classList.contains('active'))
      drag(-80,1)
      await delay(20)
      assert(signIns.length===1, 'one profile swipe stays on current account')
      close.click()
      assert(dismissals===1, 'single tap calls fullscreen dismissal')
    }
  }
}
const source = '('+simulator.toString()+')();\n'+resources+'\n'+host
writeFileSync(output, '<!doctype html><meta charset=utf-8><body><script>'+
  source.replace(/<\/script/gi, '<\\/script')+'</script></body>')
