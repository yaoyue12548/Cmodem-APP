const sendToHost = message => window.webkit.messageHandlers.board.postMessage(message);
const wifiCache = window.__cmodemWifi;
window.AndroidBoard = {
  onDeviceSwipe(card, switchBy) {
    if (!card) return;
    card.style.touchAction = 'pan-y pinch-zoom';
    let start = null, suppressClickUntil = 0;
    card.addEventListener('touchstart', event => {
      start = event.touches.length === 1 ? event.touches[0] : null;
      suppressClickUntil = 0;
    }, {passive:true});
    const cancel = () => { start = null; };
    document.addEventListener('touchstart', event => {
      if (event.touches.length > 1) cancel();
    }, {passive:true});
    card.addEventListener('touchcancel', cancel, {passive:true});
    card.addEventListener('touchmove', event => {
      if (!start) return;
      const touch = event.touches[0];
      if (!touch || Math.abs(touch.clientY-start.clientY) > Math.max(12, Math.abs(touch.clientX-start.clientX))) cancel();
    }, {passive:true});
    card.addEventListener('touchend', event => {
      const origin = start;
      start = null;
      const end = event.changedTouches[0];
      if (!origin || !end || event.touches.length || end.identifier !== origin.identifier) return;
      const dx = end.clientX-origin.clientX, dy = end.clientY-origin.clientY;
      if (Math.abs(dx) < 44 || Math.abs(dx) < Math.abs(dy)*1.5) return;
      if (event.cancelable) event.preventDefault();
      suppressClickUntil = performance.now()+400;
      switchBy(dx < 0 ? 1 : -1);
    }, {passive:false});
    card.addEventListener('click', event => {
      if (event.detail && performance.now() < suppressClickUntil) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    }, true);
  },
  verifiedProfileSave: true,
  uiFlavor: () => 'default',
  wifiCacheGet: scope => wifiCache[scope] || '',
  wifiCacheSet(scope, value) {
    wifiCache[scope] = value;
    sendToHost({action: 'wifi', scope, value});
  },
  postMessage: message => sendToHost({action: 'page', json: typeof message === 'string' ? message : JSON.stringify(message)}),
};
window.addEventListener('DOMContentLoaded', () => {
  window.setAppVersions = () => {
    window._baseVersionText = 'cmodem v' + window.__cmodemVersion;
    window._setVersionsText(window._baseVersionText);
  };
  window.setAppVersions();
  for (const footer of document.querySelectorAll('.version-line[onclick="openChangelog()"]')) {
    footer.setAttribute('role','button');
    footer.tabIndex = 0;
    footer.setAttribute('aria-label',window._baseVersionText+'，查看更新记录');
    footer.onkeydown = event => {
      if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); footer.click(); }
    };
  }
  const tabs = document.querySelector('.tabbar');
  if (!tabs) return;
  const dock = document.createElement('div');
  dock.id = 'boardBottomBar';
  tabs.before(dock);
  dock.appendChild(tabs);
  const style = document.createElement('style');
  style.textContent = `
    #boardBottomBar { --dock-height:58px; position:fixed; z-index:200; left:50%; transform:translateX(-50%);
      bottom:max(12px,env(safe-area-inset-bottom)); display:flex; align-items:center;
      gap:10px; width:min(424px,calc(100% - 28px)); }
    #boardBottomBar > .tabbar { position:static; transform:none; flex:1; width:auto; min-width:0; padding-inline:8px; }
    #boardBottomBar > .tabbar, #boardBottomBar > #cmodemClose { box-sizing:border-box; height:var(--dock-height);
      background:var(--ios-card-bg); border:.5px solid var(--ios-border); box-shadow:0 4px 15px rgba(0,0,0,.08); }
    #cmodemClose { appearance:none; flex:none; width:var(--dock-height); padding:0;
      display:grid; place-items:center; border-radius:50%; cursor:pointer; touch-action:manipulation;
      color:var(--ios-text-secondary); }
    #cmodemClose:active { transform:scale(.95); }`;
  document.head.appendChild(style);
  const button = document.createElement('button');
  button.id = 'cmodemClose';
  button.type = 'button';
  button.title = '关闭脚本';
  button.setAttribute('aria-label', '关闭脚本');
  button.innerHTML = '<svg aria-hidden="true" width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m3 3 7 7m0-6v6H4m17 11-7-7m0 6v-6h6"/></svg>';
  button.onclick = () => sendToHost({action:'close'});
  dock.appendChild(button);
});
