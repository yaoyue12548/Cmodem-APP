// Generate an offline browser smoke test from the exact files in the import package.
const {execFileSync} = require('node:child_process')
const {stripTypeScriptTypes} = require('node:module')
const {writeFileSync} = require('node:fs')
const [bundle, output] = process.argv.slice(2)
const entry = name => execFileSync('tar', ['-xOf', bundle, name], {encoding:'utf8', maxBuffer:8e6})
const resources = entry('resources.ts').replace(/^export default /, 'const resources = ')
const host = stripTypeScriptTypes(entry('index.tsx').replace(/^import .*$/gm,''))
const widgetData = stripTypeScriptTypes(entry('widget-data.ts').replace(/^export /gm,''))
if (!entry('widget.tsx').includes('Widget.present(')) throw Error('Missing widget entry')
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
    if (!errors.length && launched >= 2 && launched < 5) {
      if (launched === 2) {
        const saved=JSON.parse(keys.get(profileKey))
        const p=saved.profiles.find(p=>p.id===saved.activeId)
        p.fhLine='pro2'; p.authBlocked=true
        keys.set(profileKey,JSON.stringify(saved))
      }
      run().catch(e=>errors.push(String(e))).finally(()=>Script.exit())
      return
    }
    document.body.textContent = errors.length ? 'FAIL '+errors.join(' | ') : 'PASS '+results.join(' | ')
  }}
  window.Dialog = {alert: async value => errors.push(value.message)}
  const keys = new Map()
  const storage = new Map()
  window.Storage = {get:k=>storage.get(k), set:(k,v)=>!!storage.set(k,v), remove:k=>storage.delete(k)}
  window.Widget = {reloadAll:()=>{}}
  const profileKey = 'cmodem.LAN_PROFILES_V1'
  window.Keychain = {keys: () => [...keys.keys()].filter(k => k !== profileKey && !/_HOME_CARDS_|_SMS_TAB_/.test(k)), get: k => keys.get(k),
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
      if (launched>=3) {
        assert(await until(()=>el('localLoginModal').classList.contains('active')), 'saved FiberHome profile ready')
        board.lanDeviceType('fh')
        if(launched>=4){
          const enabled=launched===4
          assert(el('cardStyleVal').textContent===(enabled?'彩光':'素白'), 'FiberHome theme restored '+enabled)
          assert(el('smsTabSwitch').checked===enabled && (el('smsTabBtn').style.display!=='none')===enabled, 'SMS switch and tab restored '+enabled)
        }
        if(launched<5){
          const enabled=launched===3
          board.pickCardStyle(enabled?'pro':'basic')
          el('smsTabSwitch').checked=enabled
          board.toggleSmsTab(el('smsTabSwitch'))
          const before=dismissals
          el('cmodemClose').click()
          assert(await until(()=>dismissals===before+1), 'immediate exit waits for preferences')
        }
        return
      }
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
      board.lanDeviceType('air6')
      const primary={rat:'nr',isCarrier:true,isServing:true,carrierIndex:-1,band:'N78',pci:'172',earfcn:'627264',rsrp:'-65',rsrq:'-11',sinr:'30'}
      const neighbor={...primary,isCarrier:false,isServing:false,pci:'173',rsrp:'-80',rsrq:'-15',sinr:'-2',bandSource:'same-frequency'}
      const sample=(cells,carriers)=>board.updateData({operator:'Air6',mode:'5G SA',deviceOnline:true,allCells:cells,carriers})
      sample([primary,neighbor],[])
      const serving=el('servingCellsContainer'), neighbors=el('neighborListContainer')
      assert(serving.querySelectorAll('.metric-item').length===4 && neighbors.querySelectorAll('.metric-item').length===4, 'Air6 serving and neighbor use four FiberHome metric columns')
      assert(neighbors.textContent.includes('同频') && el('neighborCount').textContent.includes('1 个邻区'), 'Air6 neighbor provenance and count')
      neighbors.querySelector('.air6-cell-add').click()
      assert(el('air6Cells').value.includes('NR,627264,173'), 'Air6 add neighbor to lock draft')
      sample([{...primary,carrierIndex:0},neighbor],[{...primary,type:'PCC',arfcn:'627264',dlBandwidth:'100MHz'},{type:'SCC',rat:'lte',pci:'8',arfcn:'1201',band:'B3',dlBandwidth:'20MHz'}])
      assert(serving.children.length===2 && serving.children[1].textContent.includes('从载波') && serving.children[1].textContent.includes('B3'), 'reported SCC uses compact serving row')
      sample([],[]); board.lanDeviceType('fh')
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
      board.setAppVersions({html:'v1.4.3'})
      assert(el('versionLine').textContent==='cmodem v'+resources.version, 'overview footer uses installed version')
      el('versionLine').click()
      assert(await until(()=>el('changelogModal').classList.contains('active') && el('changelogBody').textContent.includes(resources.version) && el('changelogBody').textContent.includes('主题配色')), 'offline footer opens current and historical notes')
      board.closeChangelogModal()
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
      const selected=JSON.parse(keys.get(profileKey)).activeId
      const radio={deviceModel:'LG6851M',rsrp:-85,sinr:0,imei:'sensitive',password:'sensitive'}
      await core.webkit.messageHandlers.device.postMessage({action:'widgetSample',id:selected,sample:radio})
      const snapshot=storage.get(widgetKey)
      assert(snapshot.model==='LG6851F' && snapshot.rsrp==='-85' && snapshot.sinr==='0' && snapshot.sampledAt>0, 'widget gets selected device signal')
      assert(!JSON.stringify(snapshot).includes('sensitive'), 'widget stores only overview fields')
      await core.webkit.messageHandlers.device.postMessage({action:'widgetSample',id:'old-device',sample:{rsrp:-100}})
      assert(storage.get(widgetKey).rsrp==='-85', 'stale device cannot overwrite widget')
      close.click()
      assert(await until(()=>dismissals===1), 'single tap calls fullscreen dismissal')
    }
  }
}
const source = '('+simulator.toString()+')();\n'+resources+'\n'+widgetData+'\n'+host
writeFileSync(output, '<!doctype html><meta charset=utf-8><body><script>'+
  source.replace(/<\/script/gi, '<\\/script')+'</script></body>')
