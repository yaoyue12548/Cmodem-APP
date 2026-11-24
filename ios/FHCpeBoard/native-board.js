window.AndroidBoard.verifiedProfileSave = true;
window.AndroidBoard.onDeviceSwipe = function(card, switchBy) {
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
});
