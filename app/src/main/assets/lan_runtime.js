/* Android lifecycle/storage adapter shared by FiberHome and Air6 protocols. */
(function(){
  'use strict';
  const N=AndroidCore,STORE='LAN_PROFILES_V1',AUTH_SCHEMA=2;
  let saved;try{saved=JSON.parse(N.kcGet(STORE)||'{}');}catch(_){saved={};}
  let profiles=Array.isArray(saved.profiles)?saved.profiles:[],activeId=saved.activeId||'';
  let api=null,current=null,online=false,loginBusy=false,loginAutomatic=false,profileEditing=false,writing=false,tickBusy=false;
  let nativeActive=window.__lanNativeActive!==false,pageActive=true,foreground=nativeActive,resumePending=false;
  let sessionVersion=0,retryAt=0,retryDelay=5000,retryBlocked=false,nextProbe=0,nextLive=0,nextFull=0,nextSmsBadge=0,smsBadgeBusy=false,nextOtaStatus=0,otaStatusBusy=false;
  let activePage='overview',lastUserActivity=Date.now(),lastConnectedScope='',lastSampleSig='',lastProbeShown=null;
  let nextSmsRefresh=0,otaWatching=false,nextOtaPoll=0,otaPollMs=5000;
  let speedBusy=false,lastLiveAt=0;
  // updateData redraws the whole overview; skip it when only fast-changing fields moved.
  const sampleSig=data=>{try{return JSON.stringify(data,(key,value)=>['updateTime','downSpeed','upSpeed'].includes(key)?undefined:value);}catch(_){return '';}};
  let dispatch=Promise.resolve(),retiredQueue=Promise.resolve();const loginWaiters=[];
  const ui=(name,value)=>__nevalJS('try{if(typeof '+name+"==='function')"+name+'('+JSON.stringify(value).replace(/</g,'\\u003c')+')}catch(e){console.warn(e.message)}');
  const appVersionLabel=()=>{try{const info=JSON.parse(N.nativePing()),label=String(info.ver||'').replace(/^.*-local-/,'LOCAL-')||'LOCAL';return info.nativeCore===false?label+' · 兼容模式':label;}catch(_){return 'LOCAL';}};
  const persist=()=>N.kcSet(STORE,JSON.stringify({profiles,activeId}));
  const scopedKey=(p,key)=>'UPSTREAM_LOCAL_DEVICE_'+encodeURIComponent(p.host+'|'+(p.username||p.user||''))+'_'+key;
  const smsCacheKey=p=>p?scopedKey(p,'SMS_CACHE_V1'):'';
  function clearAuthCache(p){
    let host;try{host=LanProtocol.address(p.host);}catch(_){host=String(p.host||'');}
    for(const name of ['FH_LOGIN_AT','PWEB_LOGIN_AT','FH_LINE','FH_PROBE_AT','FH_SEED'])N.kcRemove(scopedKey(p,'UPSTREAM_LOCAL_'+name+'_'+host));
  }
  // local-14 trusted a persisted `verified` flag forever. If the CPE password
  // or cached protocol later changed, every cold start silently retried the old
  // credentials and could consume the device's entire login-attempt budget.
  // Require one explicit re-verification after this authentication migration.
  const refreshSec=value=>[0,3,5,8].includes(Number(value))?Number(value):5;
  let authMigrated=false,refreshMigrated=false;
  profiles=profiles.map(p=>{
    let next=p;
    if(![0,3,5,8].includes(Number(p.refreshSec))){refreshMigrated=true;next=Object.assign({},next,{refreshSec:p.refresh===false?0:5});}
    if(Number(next.authSchema)===AUTH_SCHEMA)return next;
    authMigrated=true;next=Object.assign({},next,{verified:false,fhLine:'',authSchema:AUTH_SCHEMA});clearAuthCache(next);return next;
  });
  if(authMigrated||refreshMigrated)persist();
  const selected=()=>profiles.find(p=>p.id===activeId);
  const same=(a,b)=>a.host===b.host&&a.username===b.username&&a.password===b.password;
  const account=p=>({id:p.id,name:p.name,nameCustom:p.nameCustom,host:p.host,user:p.username,pass:p.password,fhLine:p.fhLine||'',refresh:p.refresh,refreshSec:refreshSec(p.refreshSec),reconnect:p.reconnect,autoLogin:p.autoLogin});
  const accounts=()=>profiles.map(account);
  function applyOptions(msg){
    const p=profiles.find(p=>p.id===msg.id);if(!p)return;
    for(const key of ['refresh','reconnect','autoLogin'])if(typeof msg[key]==='boolean')p[key]=msg[key];
    if(current?.id===p.id){Object.assign(current,{refresh:p.refresh,reconnect:p.reconnect,autoLogin:p.autoLogin});api?.setReconnect(!profileEditing&&p.reconnect);if(!p.reconnect)retryAt=0;else if(!online)scheduleRetry();}
    persist();return ui('lanOptionsSaved',{id:p.id,refresh:p.refresh,reconnect:p.reconnect,autoLogin:p.autoLogin});
  }
  const state=extra=>ui('lanLoginState',Object.assign({connected:online,configured:!!selected()?.password},extra&&extra.syncProfiles?{profiles,activeId}:{},extra));
  async function config(){await ui('lineConfigResult',{mode:'local',active:'local',accounts:accounts(),activeIndex:Math.max(0,profiles.findIndex(p=>p.id===activeId))});}
  function profile(input){
    const host=LanProtocol.address(input.host),username=String(input.username||input.user||'').trim();
    if(!username)throw Object.assign(Error('请填写账号'),{code:'VALIDATION'});
    const old=profiles.find(p=>input.id&&p.id===input.id)||profiles.find(p=>p.host===host&&p.username===username);
    const credentialsMatch=old&&old.host===host&&old.username===username;
    const option=(key,fallback)=>typeof input[key]==='boolean'?input[key]:credentialsMatch&&typeof old[key]==='boolean'?old[key]:fallback;
    const p={id:old?.id||String(input.id||'lan-'+Date.now()+'-'+Math.random().toString(36).slice(2,8)),host,name:String(input.name||old?.name||host),nameCustom:typeof input.nameCustom==='boolean'?input.nameCustom:!!old?.nameCustom,username,password:String(input.password||input.pass||(credentialsMatch?old.password:'')||''),fhLine:String(input.fhLine||(credentialsMatch?old.fhLine:'')||''),refresh:option('refresh',true),refreshSec:refreshSec(input.refreshSec??(credentialsMatch?old.refreshSec:undefined)),reconnect:option('reconnect',true),autoLogin:option('autoLogin',false),verified:false,authSchema:credentialsMatch?Number(old.authSchema)||AUTH_SCHEMA:AUTH_SCHEMA};
    p.authBlocked=!!(old?.authBlocked&&same(old,p));
    p.verified=!!(old&&old.verified&&Number(old.authSchema)===AUTH_SCHEMA&&same(old,p));return p;
  }
  function save(p){const i=profiles.findIndex(x=>x.id===p.id);if(i<0)profiles.push(p);else profiles[i]=p;activeId=p.id;persist();}
  function retryable(e){return !['AUTH_REJECTED','VALIDATION','PROTOCOL'].includes(e.code);}
  function scheduleRetry(){if(profileEditing||!current||!current.reconnect||retryBlocked){retryAt=0;return;}if(!retryAt){retryAt=Date.now()+retryDelay;retryDelay=Math.min(60000,retryDelay*2);}}
  function recoveryProfile(){if(profileEditing||retryBlocked)return null;if(current)return current.reconnect?current:null;const p=selected();return p&&p.password&&!p.authBlocked?p:null;}
  function stale(version){if(version!==sessionVersion)throw Object.assign(Error('已取消旧设备会话'),{code:'STALE'});}
  function makeApi(p,version){
    const key=k=>['UPSTREAM_LOCAL_UI_PREFS_','UPSTREAM_LOCAL_HOME_CARDS_'].includes(k)?k:'UPSTREAM_LOCAL_DEVICE_'+encodeURIComponent(p.host+'|'+(p.username||''))+'_'+k;
    return new LanProtocol.LanApi({host:p.host,name:p.name,fhLine:p.fhLine,fetch:__nfetch,storage:{get:k=>N.kcGet(key(k)),set:(k,v)=>{N.kcSet(key(k),v);if(k==='UPSTREAM_LOCAL_DEVICE_NAME'&&p.onDeviceName)p.onDeviceName(String(v));},remove:k=>N.kcRemove(key(k))},
    isActive:()=>version===sessionVersion,evalJS:js=>{stale(version);return __nevalJS(js);},accounts,activeIndex:()=>Math.max(0,profiles.findIndex(x=>x.id===p.id)),
    onAccounts:list=>{stale(version);for(const a of list){const old=profiles.find(x=>x.id===a.id);if(old){old.password=String(a.pass||'');if(!old.nameCustom)old.name=String(a.name||old.name);if(current?.id===old.id){current.password=old.password;current.name=old.name;}}}persist();},
    onDeviceName:name=>{stale(version);if(profiles.find(x=>x.id===p.id)?.nameCustom||p.nameCustom)return;const saved=profiles.find(x=>x.id===p.id);if(saved)saved.name=name;if(current?.id===p.id)current.name=name;p.name=name;persist();},wallpaper:restoreWallpaper});}
  async function status(){await ui('setAcLocalState',{status:online?'ok':loginBusy?'verifying':'fail',name:(current||selected())?.name||''});}
  async function probeSmsBadge(force){
    if(!online||!api||current?.fhLine!=='air6'||activePage==='sms'||smsBadgeBusy)return;
    const now=Date.now();if(!force&&now<nextSmsBadge)return;
    smsBadgeBusy=true;nextSmsBadge=now+30000;const version=sessionVersion;
    try{await api.action({action:'smsBadgeProbe'});stale(version);}
    catch(e){if(e.code!=='STALE')nextSmsBadge=Date.now()+10000;}
    finally{smsBadgeBusy=false;}
  }
  async function probeOtaStatus(force){
    if(!online||!api||current?.fhLine!=='air6'||otaStatusBusy)return;
    const now=Date.now();if(!force&&now<nextOtaStatus)return;
    otaStatusBusy=true;nextOtaStatus=now+600000;const version=sessionVersion;
    try{await api.action({action:'air6Ota',kind:'status'});stale(version);}
    catch(e){if(e.code!=='STALE')nextOtaStatus=Date.now()+60000;}
    finally{otaStatusBusy=false;}
  }
  async function login(input,automatic){
    if(!automatic&&loginBusy&&loginAutomatic)await new Promise(resolve=>loginWaiters.push(resolve));
    if(loginBusy||writing||automatic&&profileEditing)return;loginBusy=true;loginAutomatic=automatic;let started=false,authenticated=false,version=sessionVersion,p=null;
    try{
      if(!automatic)lastUserActivity=Date.now();
      p=profile(input);if(!p.password)throw Object.assign(Error('请输入设备管理密码'),{code:'VALIDATION'});
      const previous=api;version=++sessionVersion;started=true;online=false;lastSampleSig='';lastProbeShown=null;api=null;current=p;retryAt=0;retryBlocked=false;nextSmsBadge=0;smsBadgeBusy=false;nextOtaStatus=0;otaStatusBusy=false;
      await state({automatic,busy:true,open:!automatic,message:automatic?'正在自动登录设备…':'正在登录设备…'});await status();
      await retiredQueue;await Promise.allSettled([previous?.queue,previous?.speedFlight]);
      stale(version);try{AndroidCore.clearHttpSession?.(p.host);}catch(_){}const candidate=makeApi(p,version);await candidate.login(p.username,p.password);stale(version);
      candidate.setReconnect(p.reconnect);api=candidate;online=true;p.verified=true;p.authBlocked=false;p.authSchema=AUTH_SCHEMA;
      authenticated=true;
      if(candidate.line?.mode)p.fhLine=candidate.line.mode==='air6'?'air6':['enc','legacy'].includes(candidate.line.mode)?'pro2':'pro';
      save(p);
      retryAt=0;retryDelay=5000;retryBlocked=false;nextProbe=Date.now()+20000;nextLive=0;nextFull=0;
      const connectedScope=p.host+'|'+p.username;
      if(!automatic||lastConnectedScope!==connectedScope)await ui('lanDeviceType',candidate.line?.mode==='air6'?'air6':'fh');
      lastConnectedScope=connectedScope;
      await state({automatic,syncProfiles:true,busy:false,success:true,message:'登录成功 · '+candidate.line.label});await config();await status();
      await ui('setSuperMode',candidate.line?.mode!=='air6'&&/^superadmin$/i.test(p.username)?'1':'0');
      if(candidate.line?.mode==='air6'){await probeSmsBadge(true);await probeOtaStatus(true);}
      await refresh();
      if(candidate.line?.mode==='air6')await api.action({action:'air6ReadControlSummary'});
      if(activePage==='neighbor')await api.action({action:'switchPage',page:'neighbor'});
    }catch(e){
      if(e.code==='STALE'||version!==sessionVersion)return;
      if(authenticated){await networkFailure(e);return;}
      if(e.code==='AUTH_REJECTED'&&p){
        const stored=profiles.find(x=>x.id===p.id&&same(x,p));
        if(stored){stored.verified=false;stored.authBlocked=true;stored.fhLine='';stored.authSchema=AUTH_SCHEMA;clearAuthCache(stored);persist();}
        p.verified=false;p.authBlocked=true;p.fhLine='';
      }
      if(started){online=false;retryBlocked=!retryable(e);scheduleRetry();}
      await state({automatic,busy:false,error:true,open:!automatic||!retryable(e),message:e.message||'设备连接失败'});await status();
    }finally{loginBusy=false;loginAutomatic=false;for(const resolve of loginWaiters.splice(0))resolve();}
  }
  async function refresh(force,global=false){
    if(!api||!online)return;if(force){lastSampleSig='';lastProbeShown=null;}
    const started=Date.now(),version=sessionVersion;let published=false;
    const publish=async data=>{
      stale(version);published=true;if(lastLiveAt>started)data=Object.assign({},data,{downSpeed:undefined,upSpeed:undefined});const sig=sampleSig(data);
      if(!sig||sig!==lastSampleSig){lastSampleSig=sig;await ui('updateData',data);}
      else if(data&&(data.downSpeed!=null||data.upSpeed!=null))await ui('updateSpeed',{down:data.downSpeed,up:data.upSpeed});
      if(lastProbeShown!==true){lastProbeShown=true;await ui('probeResult',true);}
    };
    const data=await api.sample({fresh:!!force||global,global,smsBadge:activePage!=='sms',onOverview:publish});stale(version);
    if(!published)await publish(data);
    const sec=refreshSec(current?.refreshSec);if(!nextFull)nextFull=sec>0?started+sec*1000:0;
    if(current?.fhLine!=='air6'||!nextLive)nextLive=Date.now()+1000;
  }
  async function live(){
    if(!api||!online||speedBusy)return;speedBusy=true;
    const version=sessionVersion,started=Date.now(),due=nextLive||started;nextLive=due+1000;
    try{const result=await api.speed();stale(version);if(result){lastLiveAt=Date.now();await ui('updateSpeed',result);}}
    finally{speedBusy=false;if(version===sessionVersion&&Date.now()-started>=1000&&nextLive<=Date.now())nextLive=due+(Math.floor((Date.now()-due)/1000)+1)*1000;}
  }
  async function speedTick(){
    if(!foreground||profileEditing||loginBusy||writing||!online||current?.fhLine!=='air6'||!current.refresh||speedBusy||Date.now()<nextLive)return;
    try{await live();}catch(e){if(['SESSION_EXPIRED','AUTH_REJECTED'].includes(e.code))await networkFailure(e);}
  }
  async function networkFailure(e){
    if(e.code==='STALE')return;
    if(!['NETWORK','SESSION_EXPIRED','AUTH_REJECTED'].includes(e.code)){nextFull=Date.now()+5000;nextLive=Date.now()+5000;await ui('showUpdateToast','读取失败：'+(e.message||'请稍后刷新'));return;}
    online=false;retryBlocked=!retryable(e);nextSmsBadge=0;smsBadgeBusy=false;nextOtaStatus=0;otaStatusBusy=false;scheduleRetry();
    lastProbeShown=false;lastSampleSig='';await ui('probeResult',false);await state({error:true,message:e.message||'设备连接已断开',open:!current?.reconnect});await status();
  }
  async function saveAccounts(msg){
    const list=Array.isArray(msg.accounts)?msg.accounts:[];
    const next=list.map(profile),index=Math.max(0,Math.min(next.length-1,Number(msg.activeIndex)||0));
    const replacement=current&&next.find(p=>p.id===current.id);
    const selectionChanged=next[index]?.id!==activeId;
    if(current&&(!replacement||!same(current,replacement)||next[index]?.id!==current.id)){
      retiredQueue=Promise.all([retiredQueue,api?.queue]).catch(()=>{});
      sessionVersion++;api=null;online=false;current=null;retryAt=0;retryBlocked=true;
    }
    else if(replacement){current=replacement;api?.setReconnect(!profileEditing&&current.reconnect);if(!current.reconnect)retryAt=0;}
    if(selectionChanged&&!current){retryAt=0;retryBlocked=true;}
    profiles=next;activeId=next[index]?.id||'';persist();
    await ui('localAccountsSaved',{ok:true,count:profiles.length});await config();await status();
  }
  async function testConnection(msg){
    if(loginBusy||writing)return;loginBusy=true;
    try{
      const p=profile(msg),previous=api,version=++sessionVersion;
      online=false;api=null;current=null;retryAt=0;retryBlocked=true;
      await retiredQueue;await previous?.queue?.catch(()=>{});
      const candidate=makeApi(p,version),result=await candidate.login(p.username,p.password);
      await ui('localTestResult',{ok:true,model:result.data?.modelName||'',message:'测试成功，请点击登录保存并进入看板'});
    }catch(e){await ui('localTestResult',{ok:false,reason:e.reason||'fail',message:e.message});}
    finally{loginBusy=false;await state({busy:false});await status();}
  }
  async function restoreWallpaper(){const data=N.kcGet('LAN_WALLPAPER');if(data)await __nevalJS('window.wallpaperChunk&&window.wallpaperChunk(0,1,'+JSON.stringify(data)+')');return !!data;}
  async function action(msg){
    switch(msg.action){
      case 'getLineConfig':return config();
      case 'saveLocalAccounts':return saveAccounts(msg);
      case 'reloginNow':if(!selected())throw Error('未配置登录信息');return login(selected(),false);
      case 'lanSwitchProfile':{
        const target=profiles.find(p=>p.id===msg.id);if(!target)throw Error('所选配置不存在，请重新打开配置列表');
        return login(target,false);
      }
      case 'testLocalConnection':return testConnection(msg);
      case 'lanOptions':return applyOptions(msg);
      case 'lanAutoRefresh':{
        const p=profiles.find(p=>p.id===msg.id)||selected();if(!p)return;
        p.refreshSec=refreshSec(msg.sec);persist();
        if(current?.id===p.id){current.refreshSec=p.refreshSec;nextFull=p.refreshSec>0?Date.now()+p.refreshSec*1000:0;}
        return ui('setAutoRefreshSec',p.refreshSec);
      }
      case 'lanActivity':{
        lastUserActivity=Date.now();

        return;
      }
      case 'lanLogin':return login(msg.profile,false);
      case 'lanResume':resumePending=true;nextProbe=0;return tick();
      case 'lanOtaWatch':{
        const interval=msg.busy?2000:5000;
        if(!otaWatching||interval!==otaPollMs)nextOtaPoll=Date.now()+interval;
        otaWatching=!!msg.open;otaPollMs=interval;return;
      }
      case 'initFlow':activePage=['overview','neighbor','control','sms','settings'].includes(msg.page)?msg.page:'overview';await state({syncProfiles:true});await config();await status();return ui('setAppVersions',{html:'v1.4.3',app1:'v1.4.3 本地',launcher:'Android '+appVersionLabel()});
      case 'switchPage':{
        activePage=['overview','neighbor','control','sms','settings'].includes(msg.page)?msg.page:'overview';
        if(activePage==='sms')nextSmsRefresh=Date.now()+10000;
        if(activePage==='overview'){lastUserActivity=Date.now();nextLive=0;lastSampleSig='';}
        if(!online||!api)return;return api.action(msg);
      }
      case 'getTokenStatus':return status();
      case 'probePoll':if(online)await api.probe();lastProbeShown=online;return ui('probeResult',online);
      case 'speedPoll':return live();
      case 'toggleCA':{
        const value=String(msg.switch)==='1'?'1':'0';let actual=value==='1'?'0':'1';writing=true;
        try{
          if(!online||!api)throw Error('请先登录设备');
          const before=await api.post('get_value_by_xmlnode',{ca:'X_FH_MobileNetwork.NetworkInfo.CaEnable'});
          if(!['0','1'].includes(String(before?.ca)))throw Error('无法读取载波聚合状态，未修改设备');
          actual=String(before.ca);
          const saved=await api.post('set_single_by_xmlnode',{url:'X_FH_MobileNetwork.NetworkInfo.CaEnable',value});
          if(!saved||!['true','1',1,true].includes(saved.success))throw Error('载波聚合设置失败');
          const readback=await api.post('get_value_by_xmlnode',{ca:'X_FH_MobileNetwork.NetworkInfo.CaEnable'});
          if(!['0','1'].includes(String(readback?.ca)))throw Error('载波聚合回读失败，请刷新确认设备状态');
          actual=String(readback.ca);if(actual!==value)throw Error('载波聚合回读不一致');
          await ui('caLocalResult',{ok:true,value:actual});return;
        }catch(e){await ui('caLocalResult',{ok:false,value:actual,message:e.message});return;}
        finally{writing=false;}
      }
      case 'refresh':if(!online){const p=recoveryProfile();return p?login(p,true):state({open:true});}await refresh(true);if(msg.page==='control'||msg.page==='neighbor')return api.action({action:'switchPage',page:msg.page});return;
      case 'smsCacheLoad':{
        const p=current||selected(),key=smsCacheKey(p);return ui('smsCacheLoaded',key?N.kcGet(key)||null:null);
      }
      case 'smsCacheSave':{
        const p=current||selected(),key=smsCacheKey(p),payload=String(msg.payload||'');if(!key||payload.length<2||payload.length>300000)return;
        try{const value=JSON.parse(payload);if(!value||!Array.isArray(value.recv)||!Array.isArray(value.send))return;}catch(_){return;}
        N.kcSet(key,payload);return;
      }
      case 'clearCacheFiles':{
        const count=typeof N.clearCaches==='function'?Number(N.clearCaches())||0:0;
        return ui('localCacheCleared',{ok:true,count});
      }
      case 'getChangelog':return ui('showChangelog',JSON.parse(N.assetRead('changelog.json')));
      case 'getDiagLog':return ui('diagPush',{level:'info',msg:'Android 直连设备；未记录密码或会话内容'});
      case 'fetchDevOperators':return ui('devOpsResult',{});
      case 'setWallpaper':{const data=String(msg.data||'');if(!/^[A-Za-z0-9+/=]+$/.test(data)||data.length>5000000)throw Error('图片内容无效或过大');N.kcSet('LAN_WALLPAPER',data);await __nevalJS('window.wallpaperChunk&&window.wallpaperChunk(0,1,'+JSON.stringify(data)+')');return ui('wallpaperResult',{ok:1});}
      case 'clearWallpaper':N.kcRemove('LAN_WALLPAPER');await __nevalJS('window.wallpaperClear&&window.wallpaperClear()');return ui('wallpaperResult',{ok:1});
    }
    if(['getUiPrefs','setUiPrefs','getHomeCards','setHomeCards'].includes(msg.action)){
      const p=selected()||{host:'192.168.8.1'};return (api||makeApi(p,sessionVersion)).action(msg);
    }
    if(!online||!api){
      const message='请先登录设备';
      if(['smsList','smsGet'].includes(msg.action))return ui('smsUpdate',{type:msg.action==='smsGet'?'get':'list',error:message});
      const callback=msg.action==='air6TaskPreview'?'air6TaskPreviewData':msg.action==='air6Ota'?'air6OtaData':msg.action.startsWith('air6Advanced')?'air6AdvancedData':msg.action.startsWith('air6Extra')?'air6ExtraData':msg.action==='air6WifiLoad'?'air6WifiData':msg.action==='air6WifiSave'?'air6WifiResult':msg.action==='air6Clients'?'air6ClientsData':msg.action==='wanInfo'?'air6WanData':/^air6(ReadControls|Set|Unlock)/.test(msg.action)?'air6WriteResult':msg.action==='sendAtCommand'?'atResult':msg.action==='rebootDevice'?'air6RebootResult':null;
      if(callback)return ui(callback,{ok:false,message,output:message,requestId:msg.requestId,kind:msg.kind});
      if(['smsSend','smsDelete','smsRead'].includes(msg.action)&&current?.fhLine==='air6')return ui('air6SmsResult',{ok:false,message,type:{smsSend:'send',smsDelete:'delete',smsRead:'read'}[msg.action],recv:msg.recv||[]});
      throw Error(message);
    }
    const readOnly=['air6ExtraRead','air6AdvancedRead','air6ReadControls','air6ReadControlSummary','air6WifiLoad','air6Clients','wanInfo','smsList','smsGet','smsBadgeProbe','air6TaskPreview'].includes(msg.action)||msg.action==='air6Ota'&&msg.kind==='status';
    if(readOnly)return api.action(msg);
    writing=true;try{return await api.action(msg);}finally{writing=false;}
  }
  window.__onPageMessage=raw=>{
    let msg;try{msg=JSON.parse(raw);}catch(_){return Promise.resolve();}
    if(!msg?.action)return Promise.resolve();
    if(msg.action==='lanProfileEditing'){
      profileEditing=!!msg.open;retryAt=0;
      if(profileEditing&&loginBusy&&loginAutomatic){sessionVersion++;api=null;online=false;retryBlocked=true;}
      api?.setReconnect(!profileEditing&&!!current?.reconnect);
      if(!profileEditing&&!online)scheduleRetry();
      return Promise.resolve();
    }
    if(msg.action==='lanVisibility')return Promise.resolve(setForeground('page',!!msg.visible));
    // Options must cancel scheduled recovery even while another action awaits
    // a slow network request; do not queue them behind device IO.
    if(msg.action==='lanOptions')return Promise.resolve(applyOptions(msg));
    // Upstream emits saveLocalAccounts then reloginNow synchronously.
    // Serialize dispatch to make the configuration durable before login.
    const task=dispatch.then(()=>action(msg)).catch(async e=>{
      if(['saveLocalAccounts','reloginNow','lanSwitchProfile','testLocalConnection','lanLogin'].includes(msg.action))await state({busy:false,error:true,message:e.message,open:true});
      else if(e.code)await networkFailure(e);else await ui('showUpdateToast',e.message);
    });dispatch=task;return task;
  };
  function setForeground(source,value){
    if(source==='native')nativeActive=value;else pageActive=value;
    const before=foreground;foreground=nativeActive&&pageActive;
    if(foreground&&!before){resumePending=true;nextProbe=0;nextLive=0;nextFull=0;return tick();}
  }
  window.__lanActive=value=>{window.__lanNativeActive=!!value;return Promise.resolve(setForeground('native',!!value)).catch(networkFailure);};
  async function tick(){
    if(!foreground||profileEditing||loginBusy||writing||tickBusy)return;tickBusy=true;const resumed=resumePending,version=sessionVersion;resumePending=false;
    try{
      if(!online){const p=recoveryProfile();if(p&&(resumed||retryAt&&Date.now()>=retryAt)){retryAt=0;await login(p,true);}return;}
      // Full global samples already verify the session. An extra heartbeat
      // before a due sample would delay that cycle by another network request.
      if((resumed||refreshSec(current.refreshSec)===0)&&Date.now()>=nextProbe){nextProbe=Date.now()+20000;try{await api.probe();stale(version);}catch(e){if(version!==sessionVersion)return;await networkFailure(e);const p=recoveryProfile();if(resumed&&p)await login(p,true);return;}}
      // An in-flight read may finish after pause or while a form opens.
      if(version!==sessionVersion||!foreground||profileEditing||writing)return;
      const sec=refreshSec(current.refreshSec),now=Date.now();
      if(sec>0&&now>=nextFull){
        const due=nextFull||now,period=sec*1000;
        nextFull=due+period;
        try{
          await refresh(resumed,true);stale(version);
          if(!foreground||profileEditing)return;
          if(current.fhLine!=='air6'&&activePage==='control')await api.action({action:'switchPage',page:'control'});
          if(!foreground||profileEditing)return;
          await ui('lanGlobalRefresh',{});
          nextSmsRefresh=Date.now()+10000;
        }finally{
          if(version===sessionVersion&&refreshSec(current?.refreshSec)===sec&&Date.now()-now>=period&&nextFull<=Date.now())nextFull=due+(Math.floor((Date.now()-due)/period)+1)*period;
        }
      }else{
        if(sec===0){await probeSmsBadge(false);await probeOtaStatus(false);}
        if(version!==sessionVersion||!foreground||profileEditing||writing)return;
        if(sec===0&&current?.fhLine==='air6'&&otaWatching&&(resumed||Date.now()>=nextOtaPoll)){
          nextOtaPoll=Date.now()+otaPollMs;await api.action({action:'air6Ota',kind:'status',fresh:true});
        }
        if(version!==sessionVersion||!foreground||profileEditing||writing)return;
        if(current.fhLine!=='air6'&&activePage==='overview'&&current.refresh&&Date.now()>=nextLive)await live();
        else if(resumed&&['control','neighbor'].includes(activePage))await api.action({action:'switchPage',page:activePage});
        else if(activePage==='sms'&&(resumed||sec===0&&Date.now()>=nextSmsRefresh)){
          nextSmsRefresh=Date.now()+10000;await ui(resumed?'lanResumeSms':'lanAutoRefreshSms',{});
        }
      }
    }catch(e){if(version===sessionVersion)await networkFailure(e);}finally{tickBusy=false;if(resumePending&&foreground)Promise.resolve().then(tick).catch(networkFailure);}
  }
  async function boot(){
    const page=N.assetRead('fhcpeweb.html'),adapter=N.assetRead('lan_ui.js'),images=N.assetRead('upstream_images.js'),lg6851fImage=N.assetRead('lg6851f_image.js'),css=N.assetRead('android_ui.css');
    await __nloadHTML(page.replace('</head>','<style>'+css+'</style><script>'+images+lg6851fImage+'</'+'script></head>').replace('</body>','<script>'+N.assetRead('device_address.js')+'</'+'script><script>'+adapter+'</'+'script><script>'+N.assetRead('air6_automation.js')+'</'+'script><script>'+N.assetRead('air6_ui.js')+'</'+'script><script>'+N.assetRead('sms_cards.js')+'</'+'script></body>'));
    await makeApi(selected()||{host:'192.168.8.1'},sessionVersion).initialize();
    const p=selected(),autoEligible=!!(p&&p.password&&!p.authBlocked);
    // Do not open a modal for a verified auto-login profile, even for a single
    // frame. Authentication failures still explicitly open the login dialog.
    await state({syncProfiles:true,open:!autoEligible});await config();await status();await restoreWallpaper();
    if(foreground&&autoEligible)await login(p,true);
    setInterval(()=>Promise.allSettled([tick().catch(networkFailure),speedTick()]),1000);
  }
  boot().catch(e=>N.log('LAN bootstrap failed: '+e.message));
})();
