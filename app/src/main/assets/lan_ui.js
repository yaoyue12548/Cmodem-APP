/* Android bridge for the imported upstream page and its original local modal. */
(function(){
  'use strict';
  const el=id=>document.getElementById(id);
  try{const root=document.documentElement,flavor=AndroidBoard.uiFlavor?.()||'default';if(root?.dataset)root.dataset.nativeUi=flavor;else root?.setAttribute?.('data-native-ui',flavor);}catch(_){}
  const header=el('operator')?.parentNode?.parentNode;
  let headerFitPending=false;
  function fitHeader(){
    headerFitPending=false;
    if(!header?.clientWidth||document.body.classList.contains('card-header-pro'))return;
    const left=el('operator')?.parentNode;if(!left)return;
    header.removeAttribute('data-header-overflow');header.style.setProperty('--lan-header-scale','1');
    let scale=1;
    while(left.scrollWidth>left.clientWidth+1&&scale>.8){scale=Math.max(.8,Math.round((scale-.025)*1000)/1000);header.style.setProperty('--lan-header-scale',String(scale));}
    if(left.scrollWidth>left.clientWidth+1)header.setAttribute('data-header-overflow','');
  }
  function scheduleHeaderFit(){if(headerFitPending)return;headerFitPending=true;requestAnimationFrame(fitHeader);}
  if(header&&typeof ResizeObserver==='function'&&typeof MutationObserver==='function'){
    new ResizeObserver(scheduleHeaderFit).observe(header);
    new MutationObserver(scheduleHeaderFit).observe(header,{subtree:true,childList:true,characterData:true});
    window.addEventListener('resize',scheduleHeaderFit);scheduleHeaderFit();
  }
  const send=(action,data)=>AndroidBoard.postMessage(JSON.stringify(Object.assign({action},data)));
  // The upstream Wi-Fi cache includes plaintext PSKs. Android stores it in
  // the encrypted Keystore-backed profile store, not WebView localStorage.
  if(typeof AndroidBoard!=='undefined'&&typeof AndroidBoard.wifiCacheGet==='function'){
    const wifiScope=()=>window.__lanWifiScope||'default';
    window._wifiLoadCache=()=>{try{const value=JSON.parse(AndroidBoard.wifiCacheGet(wifiScope())||'null');return value&&value.ok?value:null;}catch(_){return null;}};
    window._wifiSaveCache=value=>{try{AndroidBoard.wifiCacheSet(wifiScope(),JSON.stringify(value));}catch(_){}};
    try{localStorage.removeItem('cpe_wifi_cache_v1');localStorage.removeItem('CPE_WIFI_CACHE');}catch(_){}
  }
  window._activeLine='local';
  window._lineBadgeText='';
  window.sendToScriptable=(action,data)=>{
    if(action==='pickWallpaper'){pickWallpaper();return;}
    if(action==='reloginNow'||action==='testLocalConnection'||action==='lanSwitchProfile'){
      if(busy)return;
      setBusy(true);
    }
    send(action,data);
  };
  let connected=false,busy=false,profileDirty=false,saveOnlyPending=false,autoRefreshSec=5;
  const normalizeAutoRefresh=value=>[0,3,5,8].includes(Number(value))?Number(value):5;
  const modal=el('localLoginModal');
  let profileEditorOpen=false;
  const originalOpenLogin=window.openLocalLoginModal,originalCloseLogin=window.closeLocalLoginModal;
  window.openLocalLoginModal=()=>{profileEditorOpen=true;setBusy(false);send('lanProfileEditing',{open:true});originalOpenLogin();};
  window.closeLocalLoginModal=()=>{profileEditorOpen=false;originalCloseLogin();send('lanProfileEditing',{open:false});};
  const profileNameLabel=document.createElement('label');profileNameLabel.className='lan-profile-name';profileNameLabel.textContent='配置名称';
  const profileNameInput=document.createElement('input');profileNameInput.id='localProfileName';profileNameInput.type='text';profileNameInput.maxLength=40;profileNameInput.placeholder='例如：家里 Air6（可选）';profileNameLabel.appendChild(profileNameInput);el('localHost').parentNode.appendChild(profileNameLabel);
  const loginButton=modal.querySelector?.('[onclick="loginLocalAccount()"]');
  function syncProfileAction(){if(loginButton)loginButton.textContent=_localActiveIndex>=0?'切换登录':'保存并登录';}
  function setBusy(value){busy=value;for(const b of modal.querySelectorAll('button,input'))b.disabled=value;}
  window.lanShowLogin=()=>openLocalLoginModal();
  window.lanHandleBack=()=>{
    const routes=[
      ['localLoginModal','closeLocalLoginModal'],['changelogModal','closeChangelogModal'],['clearCacheDialog','closeClearCacheDialog'],['speedUnitDialog','closeSpeedUnitDialog'],
      ['trafficModal','closeTrafficModal'],['tfInputModal','closeTfInput'],['lockBandModal','closeLockBandModal'],['wifiModal','closeWifiModal'],['wifiInputDialog','closeWifiInput'],
      ['bandConfirmOverlay','closeBandConfirm'],['bandHelpOverlay','closeBandHelp'],['cellHelpOverlay','closeCellHelp'],['fhAlertModal','closeFhAlert'],['csSheet','closeCardStyleSheet'],
      ['devSwitchOverlay','closeDevSwitchModal'],['atModal','closeAtModal'],['lockCellModal','closeLockModal'],['cellInputDialog','closeCellDialog'],['netSettingOverlay','closeNetSetting'],
      ['fanPickerOverlay','closeFanPicker'],['clientsModalOverlay','closeClientsModal'],['speedOverlay','closeSpeedModal'],['offlineConfirmOverlay','closeOfflineConfirm'],
      ['rebootConfirmOverlay','closeRebootConfirm'],['macModalOverlay','closeMacModal'],['wanModalOverlay','closeWanModal'],['firmwareModalOverlay','closeFirmwareModal'],
      ['webLoginModalOverlay','closeWebLoginModal'],['rebootModalOverlay','closeRebootModal'],['diagModal','closeDiagModal'],['smsChat','closeSmsChat'],['smsComposeOverlay','closeSmsCompose'],
      ['air6Control','closeAir6Control'],['air6OtaOverlay','closeAir6Ota'],['air6OtaConfirm','closeAir6OtaConfirm']
    ];
    const candidates=[];
    for(let order=0;order<routes.length;order++){
      const [id,closer]=routes[order],node=el(id);if(!node)continue;const style=getComputedStyle(node),opacity=parseFloat(style.opacity||'1');
      if(style.display==='none'||style.visibility==='hidden'||opacity<=.05)continue;
      candidates.push({id,closer,z:Number.parseInt(style.zIndex,10)||0,order});
    }
    const refreshSheet=el('arSheet');if(refreshSheet?.classList.contains('active'))candidates.push({id:'arSheet',closer:'closeAutoRefreshSheet',z:Number.parseInt(getComputedStyle(refreshSheet).zIndex,10)||0,order:routes.length+1});
    if(candidates.length){
      candidates.sort((a,b)=>a.z-b.z||a.order-b.order);const top=candidates[candidates.length-1];
      if(top.closer==='closeAutoRefreshSheet')closeAutoRefreshSheet();else window[top.closer]?.();
      return top.id;
    }
    if(activePageId!=='overview'){switchPage('overview');return 'page';}
    return 'none';
  };
  window.startNewLocalProfile=()=>{
    if(busy)return;
    profileDirty=true;
    _localActiveIndex=-1;
    for(const [id,value] of [['localHost','192.168.8.1'],['localUser','admin'],['localPass',''],['localProfileName','']]){const node=el(id);if(node)node.value=value;}
    const msg=el('localTestMsg');if(msg)msg.textContent='正在新增设备配置';
    for(const id of ['lanRefresh','lanReconnect']){const node=el(id);if(node)node.checked=id!=='lanAutoLogin';}
    setAutoRefreshSec(5);
    renderLocalAccounts();syncProfileAction();
  };
  const renderAccounts=window.renderLocalAccounts;
  const accountLabel=window.localAcctLabel;
  window.localAcctLabel=(account,index)=>accountLabel(account,index)+(account?.user?' · '+_esc(account.user):'');
  window.renderLocalAccounts=()=>{
    renderAccounts();
    if(_localActiveIndex<0&&el('localAcctCurrent'))el('localAcctCurrent').textContent='新增配置（尚未保存）';
  };
  // A gateway can have more than one management account. Match both fields;
  // never turn an existing admin profile into a different user's profile.
  const normalizedHost=value=>DeviceAddress.parse(value);
  {const host=el('localHost');if(host){host.placeholder='192.168.8.1、IPv6 或域名';host.inputMode='url';const label=host.parentNode?.querySelector?.('label');if(label)label.textContent='设备地址';}}
  // The device may be reached over LAN, public IP or a domain; the upstream
  // markup still says "local". Rename the visible labels only.
  {
    const title=el('localLoginModal')?.querySelector?.('h2');if(title)title.textContent='登录配置';
    const badge=el('acStatusBadge'),row=badge?.closest?.('.ios-row,[onclick]')||null,rowTitle=row?.querySelector?.('.row-main-title');if(rowTitle&&rowTitle.textContent==='本地账号')rowTitle.textContent='登录配置';
    const badgeText=badge?.querySelector?.('span');if(badgeText&&badgeText.textContent==='本地未配置')badgeText.textContent='未配置';
  }
  {
    const upstreamTest=window.testLocalConnection;
    if(typeof upstreamTest==='function')window.testLocalConnection=function(...args){
      if(!(el('localHost')?.value||'').trim()){const m=el('localTestMsg');if(m){m.textContent='请填写设备地址';m.style.color='var(--ios-danger)';}return;}
      return upstreamTest.apply(this,args);
    };
  }
  window._saveLocalAccountCore=()=>{
    if(busy)return false;
    try{
      const host=normalizedHost(el('localHost').value),user=el('localUser').value.trim(),pass=el('localPass').value||'';
      if(!user)throw Error('请填写账号');
      let index=_localAccounts.findIndex(a=>{try{return normalizedHost(a.host)===host&&(a.user||a.username)===user;}catch(_){return false;}});
      const old=index<0?{}:_localAccounts[index];
      if(!pass&&!old.pass)throw Error('请输入设备管理密码');
      const account=Object.assign({},old,{host,user,pass:pass||old.pass});delete account.username;delete account.password;
      const customName=el('localProfileName').value.trim();account.name=customName||host;account.nameCustom=!!customName;
      for(const [id,key]of [['lanRefresh','refresh'],['lanReconnect','reconnect']])account[key]=el(id).checked;
      account.refreshSec=autoRefreshSec;
      if(index<0){index=_localAccounts.length;_localAccounts.push(account);}else _localAccounts[index]=account;
      _localActiveIndex=index;profileDirty=true;_localSaveSilent=false;
      renderLocalAccounts();syncProfileAction();
      send('saveLocalAccounts',{accounts:_localAccounts,activeIndex:index});return true;
    }catch(e){showUpdateToast(e.message,'warning');return false;}
  };
  window.saveLocalProfile=()=>{
    if(!_saveLocalAccountCore())return;
    saveOnlyPending=true;setBusy(true);
  };
  for(const id of ['localHost','localUser','localPass','localProfileName'])el(id).addEventListener('input',()=>{profileDirty=true;});
  const accountPicker=el('localAcctPicker');
  if(accountPicker&&!el('localNewProfileBtn')){
    const actions=document.createElement('div');actions.className='lan-profile-actions';
    const button=document.createElement('button');button.id='localNewProfileBtn';button.type='button';button.textContent='新增配置';
    button.onclick=window.startNewLocalProfile;
    actions.appendChild(button);
    const saveButton=document.createElement('button');saveButton.id='localSaveProfileBtn';saveButton.type='button';saveButton.textContent='保存配置';saveButton.onclick=window.saveLocalProfile;
    actions.appendChild(saveButton);accountPicker.parentNode.appendChild(actions);
  }
  window.lineConfigResult=function(result){
    if(!result)return;
    _localAccounts=Array.isArray(result.accounts)?result.accounts:[];
    for(const a of _localAccounts){const pending=pendingOptions.get(a.id);if(pending)Object.assign(a,pending);}
    if(!profileDirty)_localActiveIndex=_localAccounts.length?Math.max(0,Math.min(_localAccounts.length-1,result.activeIndex||0)):-1;
    renderLocalAccounts();syncProfileAction();
    const message=el('localTestMsg'),text=message.textContent,color=message.style.color;
    if(!profileDirty&&_localAccounts.length){select(_localActiveIndex);el('localProfileName').value=_localAccounts[_localActiveIndex].nameCustom?_localAccounts[_localActiveIndex].name||'':'';}
    message.textContent=text;message.style.color=color;
    renderLocalSwitchList();if(!profileDirty){syncOptions();syncAutoRefresh();}
  };
  window.localAccountsSaved=result=>{
    if(!result?.ok)return;
    profileDirty=false;
    if(saveOnlyPending){saveOnlyPending=false;setBusy(false);el('localTestMsg').textContent='配置已保存，点击登录连接设备';}
    _localSaveSilent=false;
    // Saving is not proof of login. The runtime closes the modal only after
    // successful authentication and heartbeat verification.
    send('getLineConfig');
  };
  window.localTestResult=result=>{
    setBusy(false);
    const message=el('localTestMsg');message.textContent=(result?.ok?'✓ ':'✗ ')+(result?.message||(result?.ok?'连接成功':'测试失败'));
    message.style.color=result?.ok?'var(--ios-success)':'var(--ios-danger)';
  };
  function clearDeviceMemory(){
    try{_wifiSummaryReset();wifiPending=null;wifiEditing=null;closeWifiModal();}catch(_){}
    try{
      smsClearRetry();closeSmsChat();closeSmsCompose();
      smsConversations=null;smsLoadedAt=0;smsChat=null;smsListEdit=false;smsSelected={};smsChatSelected={};
      smsPendingRecv=[];smsPendingSend=[];smsDetailsAcc={recv:[],send:[]};smsCurBatchRecv=[];smsCurBatchSend=[];
      smsDeletedIdx={recv:{},send:{}};smsLoadingMore=false;smsDiffing=false;smsCacheLoadLock=false;smsForceFresh=false;smsListInflight=false;smsLoadEndAt=0;
      smsCurRetry=0;smsLostCount=0;smsBatchDone=0;smsRenderLimit=12;smsRowsAnimated=false;window.__smsCardsReset?.();
      clearTimeout(smsRenderScrollT);smsRenderScrollT=null;
      const list=el('smsListContainer');if(list){list.innerHTML='';list.scrollTop=0;}
      const badge=el('smsBadge');if(badge){badge.style.display='none';badge.textContent='0';}
    }catch(_){}
    try{for(const key of ['smsTabCache','smsBadgeCache','smsBadgeCacheAt','cpe_wifi_cache_v1','CPE_WIFI_CACHE'])localStorage.removeItem(key);}catch(_){}
  }
  window.localCacheCleared=result=>{
    clearDeviceMemory();
    showUpdateToast(result?.ok?'缓存已清理，账号配置已保留':'缓存清理失败',result?.ok?'success':'warning',result?.ok&&result.count?'共清理 '+result.count+' 项':'');
  };
  window.lanLoginState=state=>{
    if(state.automatic&&profileEditorOpen)return;
    if(state.success){
      renderRuntimeStatus({});
      profileDirty=false;setBusy(false);
      if(Array.isArray(state.profiles)){_localAccounts=state.profiles.map(p=>({id:p.id,name:p.name,nameCustom:p.nameCustom,host:p.host,user:p.username||p.user,pass:p.password||p.pass,fhLine:p.fhLine,refresh:p.refresh,refreshSec:p.refreshSec,reconnect:p.reconnect}));_localActiveIndex=Math.max(0,_localAccounts.findIndex(p=>p.id===state.activeId));syncOptions();syncAutoRefresh();}
      const p=state.profiles?.find(p=>p.id===state.activeId);
      if(p){
        const scope=String(p.host||'')+'|'+String(p.username||p.user||'');
        if(window.__lanWifiScope&&window.__lanWifiScope!==scope){
          // In-memory upstream view state must not carry another CPE's Wi-Fi
          // credentials or messages across an account switch.
          clearDeviceMemory();
        }
        window.__lanWifiScope=scope;
        if(activePageId==='sms')try{smsOnEnter();}catch(_){}
      }
    }
    if(state.connected!==undefined)connected=!!state.connected;
    if(state.open&&!modal.classList.contains('active'))openLocalLoginModal();
    if(state.busy!==undefined)setBusy(!!state.busy);
    if(state.error)saveOnlyPending=false;
    if(state.message){el('localTestMsg').textContent=state.message;el('localTestMsg').style.color=state.error?'var(--ios-danger)':'var(--ios-text-secondary)';}
    if(state.success)closeLocalLoginModal();
  };
  window.setAcLocalState=result=>{
    const state=typeof result==='string'?result:result.status,name=typeof result==='object'?result.name:'';
    const badge=el('acStatusBadge');if(badge){badge.textContent=state==='ok'?'设备已连接'+(name?' · '+name:''):state==='verifying'?'正在登录':'设备未连接';badge.style.color=state==='ok'?'var(--ios-success)':'var(--ios-text-secondary)';}
  };
  // The upstream callback only finalizes "pending" writes after its native
  // helper reports phase=done. Android's local XML writer returns {ok:true},
  // so adapt that one response shape to the existing success path.
  const upstreamWifiSetResult=window.wifiSetResult;
  if(typeof upstreamWifiSetResult==='function')window.wifiSetResult=result=>
    upstreamWifiSetResult(result&&result.ok===true&&!result.phase?Object.assign({},result,{phase:'done'}):result);
  window.caLocalResult=result=>{
    try{_caPendingPush=null;}catch(_){}
    try{if(typeof _netOpEnd==='function')_netOpEnd();}catch(_){}
    const toggle=el('caSwitch');if(toggle&&result?.value!==undefined)toggle.checked=String(result.value)==='1';
    showUpdateToast(result?.ok?(toggle?.checked?'载波聚合已开启':'载波聚合已关闭'):(result?.message||'载波聚合设置失败'),result?.ok?'success':'warning');
  };
  window.openDevSwitchModal=()=>{
    const overlay=el('devSwitchOverlay');if(!overlay)return;
    _mAdd('devSwitch');el('devSwitchTitle').textContent='切换账号';el('devSwitchSub').textContent='选择已保存的登录配置';
    overlay.style.opacity='1';overlay.style.visibility='visible';el('devSwitchCard').style.transform='scale(1)';send('getLineConfig');renderLocalSwitchList();
  };
  const runtimeCard=document.createElement('div');runtimeCard.id='lanRuntimeCard';runtimeCard.className='card lan-runtime-card';
  runtimeCard.style.display='none';
  runtimeCard.innerHTML='<div class="lan-runtime-grid"><div><span>CPU 使用率</span><strong id="lanRuntimeCpu">--</strong></div><div><span>内存实际占用</span><strong id="lanRuntimeRam">--</strong></div><div><span>运行时长</span><strong id="lanRuntimeUptime">--</strong></div></div>';
  const trafficCard=el('trafficCard'),gaugeCard=el('gaugeCard');trafficCard?.insertAdjacentElement?.('afterend',runtimeCard);
  const percent=v=>v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v))?Number(v).toFixed(1)+'%':'--';
  function renderRuntimeStatus(data){
    el('lanRuntimeCpu').textContent=percent(data?.cpuUsage);el('lanRuntimeRam').textContent=percent(data?.ramUsage);el('lanRuntimeUptime').textContent=String(data?.uptimeText||'--');
  }
  const upstreamData=window.updateData;
  // The header network label comes only from full overview samples (deviceOnline).
  // Cell-page refreshes carry a partial mode that must not overwrite it.
  let headerMode='';
  window.updateData=function(data){
    const air6=document.body?.dataset?.lanDevice==='air6';
    if(data?.deviceOnline){if(air6)renderRuntimeStatus(data);if(typeof data.mode==='string')headerMode=data.mode;}
    else if(data&&typeof data==='object'&&data.mode!==undefined&&headerMode)data=Object.assign({},data,{mode:headerMode});
    const result=upstreamData?.(data);
    if(air6&&data?.deviceOnline){const imei=el('setImei');if(imei){imei.textContent=String(data.imei||'--');const eye=imei.parentElement?.querySelector?.('.eye-btn');if(eye)eye.style.display='none';}}
    return result;
  };
  const headerArrow=el('hcArrow'),proDeviceCount=el('hcDevCntVal2')?.closest?.('svg'),countParent=proDeviceCount?.parentNode,countNext=proDeviceCount?.nextSibling,arrowChildren=headerArrow?[...headerArrow.childNodes]:[],arrowClick=headerArrow?.onclick,arrowDisplay=headerArrow?.style.display||'';
  window.__lanAir6Layout=enabled=>{
    runtimeCard.style.display=enabled?'':'none';
    if(enabled)gaugeCard?.parentNode?.insertBefore?.(runtimeCard,gaugeCard);else trafficCard?.insertAdjacentElement?.('afterend',runtimeCard);
    if(!headerArrow)return;
    if(enabled){headerArrow.onclick=null;headerArrow.removeAttribute?.('title');headerArrow.removeAttribute?.('aria-label');if(proDeviceCount){headerArrow.replaceChildren(proDeviceCount);headerArrow.style.display='flex';}else headerArrow.style.display='none';}
    else{if(proDeviceCount&&countParent&&!countParent.contains(proDeviceCount))countParent.insertBefore(proDeviceCount,countNext&&countNext.parentNode===countParent?countNext:null);headerArrow.replaceChildren(...arrowChildren);headerArrow.onclick=arrowClick;headerArrow.style.display=arrowDisplay;}
  };
  window._pickLocalDev=index=>{
    if(busy)return;const a=_localAccounts[index];if(!a?.id){showUpdateToast('配置尚未保存，请在登录页保存后切换','warning');return;}
    profileDirty=false;closeDevSwitchModal();setBusy(true);send('lanSwitchProfile',{id:a.id});
  };
  // Keep requested Android lifecycle options separate from upstream's fields.
  const extra=document.createElement('details');extra.id='lanOptions';extra.innerHTML='<summary>自动连接选项</summary><label><input id="lanRefresh" type="checkbox" checked> 实时网速（1s）</label><label><input id="lanReconnect" type="checkbox" checked> 断线自动重登</label>';
  el('localTestMsg').parentNode.appendChild(extra);
  const style=document.createElement('style');style.textContent='#lanOptions{font-size:12px;color:var(--ios-text-secondary);margin:14px 0 0}#lanOptions summary{cursor:pointer}#lanOptions label{display:flex;align-items:center;gap:8px;margin-top:10px}#localTestMsg{white-space:pre-wrap;overflow-wrap:anywhere}.lan-ar-pill{display:inline-flex;align-items:center;gap:3px;padding:2px 7px;border-radius:999px;background:var(--ios-primary-soft);color:var(--ios-primary);font-size:10px;font-weight:700;cursor:pointer}.lan-ar-pill.off{color:var(--ios-text-tertiary);background:var(--ios-bg)}#arSheet .cs-opt{margin-bottom:9px}#arSheet .cs-opt.on{border-color:var(--ios-primary);background:var(--ios-primary-soft)}#arSheet .cs-opt .cs-tick{opacity:0}#arSheet .cs-opt.on .cs-tick{opacity:1}';document.head.appendChild(style);
  const autoRow=document.createElement('div');autoRow.id='autoRefreshRow';autoRow.className='ios-row clickable';autoRow.innerHTML='<div class="row-left"><div class="row-icon icon-green"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-2.64-6.36"></path><path d="M21 3v6h-6"></path></svg></div><div class="row-title"><span class="row-main-title">自动刷新</span><span class="row-sub-title">前台全局数据刷新</span></div></div><div class="row-right"><span id="autoRefreshVal" style="color:var(--ios-text-secondary);font-size:13px">5 秒</span><svg class="chevron" viewBox="0 0 24 24"><path d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6-1.41-1.41z"></path></svg></div>';
  autoRow.onclick=()=>openAutoRefreshSheet();
  const atRow=el('atRow');if(atRow?.parentNode)atRow.parentNode.appendChild(autoRow);
  const sheet=document.createElement('div');sheet.id='arSheet';sheet.className='lock-modal-overlay';sheet.style.visibility='hidden';sheet.onclick=event=>{if(event.target===sheet)closeAutoRefreshSheet();};sheet.innerHTML='<div id="arSheetCard" style="width:100%;max-width:340px;max-height:82%;overflow-y:auto;-webkit-overflow-scrolling:touch;background:var(--ios-card-bg);border-radius:18px;padding:20px 16px 16px;box-shadow:0 18px 50px rgba(0,0,0,.28);transform:scale(.9);opacity:0;transition:transform .28s cubic-bezier(.32,.72,0,1),opacity .28s;pointer-events:auto"><div style="font-size:26px;font-weight:600;letter-spacing:-.5px;padding:16px 2px 6px">自动刷新</div><div style="font-size:12px;color:var(--ios-text-secondary);line-height:1.6;padding:0 2px 14px">前台按所选间隔刷新全部状态，后台暂停。短信自动刷新开启时同步更新，正在编辑的内容不会被覆盖。</div><div class="cs-opt" id="arOpt3"><div class="cs-opt-head"><div><div class="cs-opt-name">3 秒</div><div class="cs-opt-sub">更新更频繁</div></div><span class="cs-tick">✓</span></div></div><div class="cs-opt" id="arOpt5"><div class="cs-opt-head"><div><div class="cs-opt-name">5 秒</div><div class="cs-opt-sub">默认间隔</div></div><span class="cs-tick">✓</span></div></div><div class="cs-opt" id="arOpt8"><div class="cs-opt-head"><div><div class="cs-opt-name">8 秒</div><div class="cs-opt-sub">减少刷新次数</div></div><span class="cs-tick">✓</span></div></div><div class="cs-opt" id="arOpt0"><div class="cs-opt-head"><div><div class="cs-opt-name">关闭</div><div class="cs-opt-sub">关闭全局刷新</div></div><span class="cs-tick">✓</span></div></div><button id="arCancelBtn" style="width:100%;border:none;border-radius:999px;padding:11px 0;font-size:15px;font-weight:500;background:var(--ios-bg);color:var(--ios-text);cursor:pointer;margin-top:2px">取消</button></div>';
  document.body.appendChild(sheet);
  for(const sec of [0,3,5,8]){const option=el('arOpt'+sec);if(option)option.onclick=()=>pickAutoRefresh(sec);}
  const cancel=el('arCancelBtn');if(cancel)cancel.onclick=()=>closeAutoRefreshSheet();
  const bandChip=el('hcBandChip');if(bandChip?.parentNode){const pill=document.createElement('span');pill.id='arPill';pill.className='lan-ar-pill';pill.innerHTML='<span>↻</span><b id="arPillTxt">5s</b>';pill.onclick=event=>{event?.stopPropagation?.();openAutoRefreshSheet();};bandChip.parentNode.appendChild(pill);}
  function markAutoRefresh(){for(const sec of [0,3,5,8]){const node=el('arOpt'+sec);if(!node?.classList)continue;if(sec===autoRefreshSec)node.classList.add?.('on');else node.classList.remove?.('on');}}
  function setAutoRefreshSec(value){autoRefreshSec=normalizeAutoRefresh(value);const text=autoRefreshSec?autoRefreshSec+' 秒':'关闭';const val=el('autoRefreshVal');if(val)val.textContent=text;const pill=el('arPill'),pillText=el('arPillTxt');if(pillText)pillText.textContent=autoRefreshSec?autoRefreshSec+'s':'关';if(pill?.classList){if(autoRefreshSec)pill.classList.remove?.('off');else pill.classList.add?.('off');}markAutoRefresh();}
  window.setAutoRefreshSec=setAutoRefreshSec;
  window.openAutoRefreshSheet=()=>{_mAdd('autoRefresh');markAutoRefresh();const panel=el('arSheetCard');sheet.classList.add('active');sheet.style.visibility='visible';if(panel){panel.style.transform='scale(1)';panel.style.opacity='1';}};
  window.closeAutoRefreshSheet=()=>{_mDel('autoRefresh');const panel=el('arSheetCard');if(panel){panel.style.transform='scale(.9)';panel.style.opacity='0';}sheet.classList.remove('active');sheet.style.visibility='hidden';};
  window.pickAutoRefresh=sec=>{setAutoRefreshSec(sec);const a=_localAccounts[_localActiveIndex];if(a){a.refreshSec=autoRefreshSec;send('lanAutoRefresh',{id:a.id,sec:autoRefreshSec});}setTimeout(closeAutoRefreshSheet,180);};
  function syncAutoRefresh(){const a=_localAccounts[_localActiveIndex]||{};setAutoRefreshSec(a.refreshSec??(a.refresh===false?0:5));}
  setAutoRefreshSec(5);
  const pendingOptions=new Map();
  window.lanOptionsSaved=result=>{
    const pending=pendingOptions.get(result.id);if(pending&&Object.keys(pending).some(k=>pending[k]!==result[k]))return;
    const a=_localAccounts.find(a=>a.id===result.id);if(a)Object.assign(a,{refresh:result.refresh,reconnect:result.reconnect,autoLogin:result.autoLogin});
    pendingOptions.delete(result.id);if(_localAccounts[_localActiveIndex]?.id===result.id)syncOptions();
  };
  function syncOptions(){const a=_localAccounts[_localActiveIndex]||{};for(const [id,key]of [['lanRefresh','refresh'],['lanReconnect','reconnect']])el(id).checked=a[key]!==false;}
  syncOptions();
  const select=window.selectLocalAccount;window.selectLocalAccount=index=>{if(busy)return;profileDirty=true;select(index);el('localProfileName').value=_localAccounts[index]?.nameCustom?_localAccounts[index].name||'':'';syncOptions();syncAutoRefresh();syncProfileAction();};
  window.deleteLocalAccountAt=index=>{
    if(busy||index<0||index>=_localAccounts.length)return;
    const selectedAccount=_localAccounts[_localActiveIndex];_localAccounts.splice(index,1);
    const retained=_localAccounts.indexOf(selectedAccount);_localActiveIndex=retained>=0?retained:Math.min(index,_localAccounts.length-1);
    profileDirty=true;
    if(_localActiveIndex>=0)selectLocalAccount(_localActiveIndex);
    else{for(const id of ['localHost','localUser','localPass','localProfileName'])el(id).value='';renderLocalAccounts();syncProfileAction();syncOptions();}
    _localSaveSilent=true;send('saveLocalAccounts',{accounts:_localAccounts,activeIndex:Math.max(0,_localActiveIndex)});
  };
  for(const [id,key]of [['lanRefresh','refresh'],['lanReconnect','reconnect']])el(id).onchange=()=>{
    const a=_localAccounts[_localActiveIndex];if(!a)return;a[key]=el(id).checked;
    const options={refresh:el('lanRefresh').checked,reconnect:el('lanReconnect').checked};Object.assign(a,options);
    if(a.id){pendingOptions.set(a.id,options);send('lanOptions',Object.assign({id:a.id},options));}
  };
  let lastActivitySent=0;const reportActivity=()=>{const now=Date.now();if(now-lastActivitySent<1000)return;lastActivitySent=now;send('lanActivity');};
  document.addEventListener('touchstart',reportActivity,{passive:true});document.addEventListener('click',reportActivity,{passive:true});
  // WebView file chooser uses Android's document picker (no iOS Photos API).
  window.__iosImagePicked=encoded=>{
    const img=new Image();img.onload=()=>{const scale=Math.min(1,1600/Math.max(img.width,img.height)),canvas=document.createElement('canvas');canvas.width=Math.round(img.width*scale);canvas.height=Math.round(img.height*scale);canvas.getContext('2d').drawImage(img,0,0,canvas.width,canvas.height);send('setWallpaper',{data:canvas.toDataURL('image/jpeg',.72).split(',')[1]});};img.src='data:image/jpeg;base64,'+encoded;
  };
  function pickWallpaper(){
    if(typeof AndroidBoard.pickWallpaper==='function'){AndroidBoard.pickWallpaper();return;}
    const input=document.createElement('input');input.type='file';input.accept='image/*';input.onchange=()=>{
      const file=input.files?.[0];if(!file)return;
      const reader=new FileReader();reader.onload=()=>{
        const img=new Image();img.onload=()=>{const scale=Math.min(1,1600/Math.max(img.width,img.height)),canvas=document.createElement('canvas');canvas.width=Math.round(img.width*scale);canvas.height=Math.round(img.height*scale);canvas.getContext('2d').drawImage(img,0,0,canvas.width,canvas.height);send('setWallpaper',{data:canvas.toDataURL('image/jpeg',.72).split(',')[1]});};img.src=reader.result;
      };reader.readAsDataURL(file);
    };input.click();
  }
  try{_spStop();_ppStop();_spStart=()=>{};_ppStart=()=>{};_spArm=()=>{};_ppArm=()=>{};_probeNet=()=>{};}catch(_){}
  // Native activity and page visibility already share one foreground gate.
  window._visResumeRefresh=()=>{};
  let smsAutoRefresh=true;
  try{smsAutoRefresh=localStorage.getItem('lanSmsAutoRefresh')!=='0';}catch(_){}
  const smsRefreshOption=document.createElement('label');smsRefreshOption.className='lan-sms-refresh-option';
  smsRefreshOption.innerHTML='<span><strong>短信自动刷新</strong><small>跟随自动刷新间隔，单独开启时每 10 秒</small></span><input id="lanSmsAutoRefresh" type="checkbox" aria-label="短信自动刷新">';
  el('arSheetCard').insertBefore(smsRefreshOption,el('arCancelBtn'));
  el('lanSmsAutoRefresh').checked=smsAutoRefresh;
  el('lanSmsAutoRefresh').onchange=event=>{smsAutoRefresh=event.target.checked;try{localStorage.setItem('lanSmsAutoRefresh',smsAutoRefresh?'1':'0');}catch(_){};};
  function refreshSmsIfIdle(){
    if(!connected||profileEditorOpen||document.visibilityState==='hidden')return;
    // These upstream flags are lexical globals, not properties of window.
    // Keep editing/composing stable; fetching does not mark messages read.
    if(smsListInflight||smsLoadingMore||smsCacheLoadLock||smsListEdit||window.__smsWriteBusy?.())return;
    if(el('smsComposeOverlay')?.classList.contains('active')||el('smsComposeOverlay')?.style.display==='flex')return;

    smsOnEnter(true);
  }
  window.lanResumeSms=refreshSmsIfIdle;
  window.lanAutoRefreshSms=()=>{if(smsAutoRefresh)refreshSmsIfIdle();};
  window.lanGlobalRefresh=()=>{window.lanAutoRefreshSms();window.air6RefreshOpenPanel?.();};
  // Upstream shares window scrolling across all tabs. SMS has its own fixed
  // scroll container, so only ordinary document pages take part here.
  const scrollPositions=new Map(),show=window.showPage;
  let smsTransitionSeq=0;
  function settleSmsTransition(seq){
    requestAnimationFrame(()=>requestAnimationFrame(()=>{
      if(seq!==smsTransitionSeq||activePageId!=='sms')return;
      const list=document.getElementById('smsListContainer');if(list)list.scrollTop=0;
      document.documentElement.classList.remove('__sms-transition');
    }));
  }
  window.showPage=page=>{
    const previous=activePageId,changed=previous!==page;
    if(changed&&previous!=='sms')scrollPositions.set(previous,window.scrollY||0);
    if(changed&&page==='sms'){
      // CSS snapshots the previous frame in place. Keep it over the incoming
      // fixed page until the incoming layout has been painted at inset:0.
      smsTransitionSeq+=1;
      document.documentElement.classList.add('__sms-transition');
      document.documentElement.scrollTop=0;
      document.body.scrollTop=0;
      const list=document.getElementById('smsListContainer');if(list)list.scrollTop=0;
      show(page);
      settleSmsTransition(smsTransitionSeq);
      return;
    }
    if(changed)document.documentElement.classList.remove('__sms-transition');
    show(page);
    try{if(typeof _spPageHook==='function'){_spPageHook(page);document.documentElement.dataset.page=page;}}catch(_){}
    if(!changed)return;
    window.scrollTo(0,scrollPositions.get(page)||0);
    // Wait for the newly displayed page to complete layout before restoring.
    requestAnimationFrame(()=>{if(activePageId===page)window.scrollTo(0,scrollPositions.get(page)||0);});
  };
  try{show(activePageId);if(typeof _spPageHook==='function'){_spPageHook(activePageId);document.documentElement.dataset.page=activePageId;}}catch(_){}
  window.__lanRestoreVisuals=()=>{smsTransitionSeq++;document.documentElement.classList.remove('__sms-transition');};
  document.addEventListener('visibilitychange',()=>{window.__lanRestoreVisuals();send('lanVisibility',{visible:document.visibilityState!=='hidden'});});
  window.__lanVisible=()=>modal.classList.contains('active');
})();
