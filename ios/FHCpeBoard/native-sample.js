window.AndroidCore.widgetSample = function(id, data) {
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
    window.webkit.messageHandlers.core.postMessage({action:'widgetSample', id, sample});
    this.widgetProfile = id;
    this.widgetSampleTime = now;
  };
