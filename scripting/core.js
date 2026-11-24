// Runs inside the private protocol WebView. Only this view can request device IO.
const nativeRequest = message => window.webkit.messageHandlers.device.postMessage(message);
const values = window.__cmodemValues;
const storageFailures = error => nativeRequest({action: 'error', text: String(error)});
window.AndroidCore = {
  widgetSample(id, data) {
    const now = Date.now();
    if (this.widgetProfile === id && now - this.widgetSampleTime < 30000) return;
    const sample = {};
    for (const key of ['deviceModel','operator','mode','rsrp','sinr','rsrq','rssi','bandTag','onlineNum','modemTemp','uptimeText','pci','pccArfcn','bandwidth','todayRxToday','todayTxToday','monthRxToday','monthTxToday'])
      sample[key] = data[key] ?? '';
    const carriers = Array.isArray(data.carriers) ? data.carriers : [];
    const main = carriers.find(c => c?.type === 'PCC') || carriers[0];
    sample.carrierCount = carriers.length;
    sample.primaryBand = main?.band || '';
    sample.bandwidth = main?.dlBandwidth || main?.bandwidth || sample.bandwidth;
    if (Array.isArray(data.air6Daily)) {
      const date = new Date();
      const key = ''+date.getFullYear()+String(date.getMonth()+1).padStart(2,'0')+String(date.getDate()).padStart(2,'0');
      const today = data.air6Daily.find(day => String(day.date) === key);
      if (today?.rx != null && today?.tx != null) {
        sample.todayRxToday = Number(today.rx)/1048576;
        sample.todayTxToday = Number(today.tx)/1048576;
      }
    }
    nativeRequest({action:'widgetSample', id, sample}).catch(() => {});
    this.widgetProfile = id;
    this.widgetSampleTime = now;
  },
  kcGet: key => values[key] || '',
  kcContains: key => Object.hasOwn(values, key),
  kcSet(key, value) {
    values[key] = String(value);
    nativeRequest({action: 'set', key, value: String(value)}).catch(storageFailures);
  },
  async kcSetVerified(key, value) {
    await nativeRequest({action: 'set', key, value});
    values[key] = value;
  },
  kcRemove(key) {
    delete values[key];
    nativeRequest({action: 'remove', key}).catch(storageFailures);
  },
  clearCaches() {
    for (const key of Object.keys(values)) {
      if (/CACHE|CACHED_DATA/i.test(key)) this.kcRemove(key);
    }
    nativeRequest({action: 'clearCaches'}).catch(storageFailures);
    return 0;
  },
  assetRead: name => window.__cmodemAssets[name] || '',
  fileDocsDir: () => 'Documents', fileExists: () => false, fileRead: () => '',
  fileWrite: () => {}, fileRemove: () => {}, stringify: value => value, parse: value => value,
  themeDark: () => matchMedia('(prefers-color-scheme: dark)').matches,
  nativePing: () => JSON.stringify({ok: true, ver: '1.4.3', nativeCore: false}),
  decodeSmsPdu: decodeSmsPdu,
  clearHttpSession: url => nativeRequest({action: 'clearSession', origin: new URL(url).origin}),
  reseed: () => 'ok',
  log: text => nativeRequest({action: 'error', text}),
};
window.__nfetch = async (url, options = {}) => {
  const target = new URL(url);
  if (target.username || target.password || DeviceAddress.parse(target.origin) !== target.origin)
    throw Error('无效的设备地址');
  const result = await nativeRequest({action: 'fetch', url: target.href, origin: target.origin,
    path: target.pathname, secure: target.protocol === 'https:', options});
  if (!result.status || [502,503,504,520,521,522,523,524,525,526,530].includes(result.status))
    throw Object.assign(Error(result.status ? '设备暂时不可用（HTTP '+result.status+'）' : result.text), {code:'NETWORK'});
  return {status: result.status, ok: result.status >= 200 && result.status < 300, text: async () => result.text};
};
window.__nevalJS = js => nativeRequest({action: 'eval', js});
window.__nloadHTML = html => nativeRequest({action: 'load', html});
