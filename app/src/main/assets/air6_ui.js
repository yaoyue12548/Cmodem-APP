/* Air6-specific controls: device semantics differ from the FiberHome XML UI. */
(function(){
  'use strict';
  const el=id=>document.getElementById(id),send=(action,data)=>sendToScriptable(action,data);
  let active=false,busy=false,systemDescription='--';
  const originalLabels=new Map();
  const systemRows=[],systemRowById=new Map();
  const cardStyleRow=el('cardStyleRow'),cardStyleParent=cardStyleRow?.parentNode,cardStyleNext=cardStyleRow?.nextSibling,boardLogRow=el('boardLogRow');
  let homeCardsSeen=false,homeCardsConfigured=false;
  const upstreamHomeCardsResult=window.homeCardsResult;
  window.homeCardsResult=result=>{
    const conf=result?.conf||{},hasHeader=Object.prototype.hasOwnProperty.call(conf,'header');homeCardsSeen=true;if(hasHeader)homeCardsConfigured=true;
    const value=upstreamHomeCardsResult?.apply(window,[result]);
    if(active&&!homeCardsConfigured)applyHomeCards({header:'pro'});return value;
  };
  const settingsTab=document.querySelector('.tab-btn[data-page="settings"]'),otaTabBadge=document.createElement('span'),firmwareBadge=el('fwNewBadge'),firmwareBadgeText=firmwareBadge?.textContent||'有新版本',firmwareBadgeParent=firmwareBadge?.parentNode,firmwareBadgeNext=firmwareBadge?.nextSibling;
  otaTabBadge.id='air6OtaTabBadge';otaTabBadge.textContent='1';otaTabBadge.setAttribute('aria-label','有固件更新');if(settingsTab)settingsTab.appendChild(otaTabBadge);
  const setOtaBadge=show=>{otaTabBadge.style.display=show?'flex':'none';if(active&&firmwareBadge){firmwareBadge.textContent='新';firmwareBadge.classList.add('air6-ota-row-badge');firmwareBadge.style.display=show?'inline-flex':'none';}};setOtaBadge(false);
  const firmwareRow=el('setSwVersion')?.closest('.ios-row'),firmwareRowAction=firmwareRow?.getAttribute('onclick')||'',firmwareRowClickable=firmwareRow?.classList.contains('clickable');
  const otaEntry=document.createElement('button');otaEntry.id='air6OtaEntry';otaEntry.className='air6-ota-entry';otaEntry.style.display='none';
  otaEntry.innerHTML='<span><strong>可用更新</strong><small id="air6OtaEntryStatus">查看固件版本</small></span><b>点击查看 ›</b>';
  firmwareRow?.parentNode?.parentNode?.insertBefore(otaEntry,firmwareRow.parentNode);
  otaEntry.onclick=()=>window.openAir6Ota();
  for(const [id,label] of [['air6Kernel','系统内核'],['air6Baseband','模组基带版本'],['air6Module','模组型号']]){
    const row=document.createElement('div');row.className='ios-row air6-system-row';row.style.display='none';
    row.innerHTML='<div class="row-left"><span class="row-main-title">'+label+'</span></div><div class="row-right"><span id="'+id+'">--</span></div>';
    firmwareRow?.parentNode.insertBefore(row,firmwareRow.nextSibling);systemRows.push(row);systemRowById.set(id,row);
  }
  const deviceModelRow=el('setDeviceModel')?.closest('.ios-row'),wanRow=el('setWanIp')?.closest('.ios-row'),wanParent=wanRow?.parentNode,wanNext=wanRow?.nextSibling;
  function arrangeSystemRows(enabled){
    const parent=firmwareRow?.parentNode;if(!parent)return;
    if(enabled){
      if(deviceModelRow&&wanRow)parent.insertBefore(wanRow,deviceModelRow.nextSibling);
      const kernel=systemRowById.get('air6Kernel'),module=systemRowById.get('air6Module'),baseband=systemRowById.get('air6Baseband');
      if(kernel)parent.insertBefore(kernel,firmwareRow.nextSibling);if(module)parent.insertBefore(module,kernel?.nextSibling||firmwareRow.nextSibling);if(baseband)parent.appendChild(baseband);
    }else{
      let anchor=firmwareRow;for(const row of systemRows){parent.insertBefore(row,anchor.nextSibling);anchor=row;}
      if(wanRow&&wanParent)wanParent.insertBefore(wanRow,wanNext&&wanNext.parentNode===wanParent?wanNext:null);
    }
  }
  function arrangeControlRows(enabled){
    if(enabled&&cardStyleRow&&boardLogRow?.parentNode)boardLogRow.parentNode.insertBefore(cardStyleRow,boardLogRow.nextSibling);
    else if(cardStyleRow&&cardStyleParent)cardStyleParent.insertBefore(cardStyleRow,cardStyleNext&&cardStyleNext.parentNode===cardStyleParent?cardStyleNext:null);
  }
  const firmware=window.openFirmwareModal;
  const firmwareTitle=el('firmwareBody')?.previousElementSibling,firmwareTitleText=firmwareTitle?.textContent;
  window.openFirmwareModal=function(...args){
    if(active)return;
    return firmware.apply(this,args);
  };
  const panel=document.createElement('div');panel.id='air6Control';panel.className='lock-modal-overlay';
  panel.setAttribute('role','dialog');panel.setAttribute('aria-modal','true');panel.setAttribute('aria-labelledby','air6Title');
  panel.innerHTML='<div class="lock-modal-container"><div class="air6-modal-head"><strong id="air6Title">网络设置</strong><button id="air6Close" aria-label="关闭">×</button></div><div class="lock-modal-content air6-modal-content"><section data-air6-section="rat"><p id="air6RatCurrent" class="air6-hint">当前制式：待读取</p><label>网络模式<select id="air6Rat"><option value="21">自动（3G / 4G / 5G）</option><option value="19">4G + 5G</option><option value="15">仅 5G</option><option value="3">仅 4G</option><option value="1">仅 3G</option></select></label><div class="air6-actions"><button id="air6RatRead">读取制式</button><button id="air6RatSave" class="air6-primary">应用制式</button></div></section><section data-air6-section="band"><label>4G bands<input id="air6Lte" type="hidden"></label><div id="air6LteChips" class="air6-chips"></div><label>5G bands<input id="air6Nr" type="hidden"></label><div id="air6NrChips" class="air6-chips"></div><p class="air6-hint">保存后立即生效，模组可能重新搜网或重启。</p><div class="air6-actions"><button id="air6BandReset">解除频段限制</button><button id="air6BandSave" class="air6-primary">应用频段</button></div></section><section data-air6-section="cell"><p id="air6CellState" class="air6-hint">待读取</p><label>网络制式<select id="air6CellRat"><option value="nr">5G NR</option><option value="lte">4G LTE</option></select></label><label>ARFCN / EARFCN<input id="air6Arfcn" inputmode="numeric"></label><label>PCI<input id="air6Pci" inputmode="numeric"></label><div class="air6-actions"><button id="air6CellReset">解锁</button><button id="air6CellSave" class="air6-primary">锁定</button></div></section><p id="air6Result" role="status" class="air6-hint"></p></div><div class="air6-modal-foot"><button id="air6Read">刷新</button><button id="air6Cancel">关闭</button></div></div>';
  document.body.appendChild(panel);
  const otaOverlay=document.createElement('div');otaOverlay.id='air6OtaOverlay';otaOverlay.className='lock-modal-overlay';otaOverlay.innerHTML='<div class="lock-modal-container air6-ota-card"><div class="air6-modal-head"><strong>Air6 在线升级</strong><button id="air6OtaClose" aria-label="关闭">×</button></div><div class="air6-ota-body"><div class="air6-ota-row"><span>当前版本</span><b id="air6OtaCurrent">--</b></div><div class="air6-ota-row"><span>最新版本</span><b id="air6OtaLatest">--</b></div><label class="air6-ota-history">历史版本<select id="air6OtaHistory"></select></label><div class="air6-ota-row"><span>固件大小</span><b id="air6OtaSize">--</b></div><p id="air6OtaMessage" class="air6-hint"></p><div class="air6-ota-notes-title">更新内容</div><pre id="air6OtaNotes"></pre><button id="air6OtaNotesToggle" class="air6-ota-notes-toggle">展开更新说明</button><div class="air6-ota-actions"><button id="air6OtaCheck">检查更新</button><button id="air6OtaDownload">下载并校验</button><button id="air6OtaUpgrade" class="air6-primary">升级并重启</button></div></div></div>';
  const otaConfirm=document.createElement('div');otaConfirm.id='air6OtaConfirm';otaConfirm.className='lock-modal-overlay';otaConfirm.innerHTML='<div class="lock-modal-container air6-ota-confirm"><strong id="air6OtaConfirmTitle">确认升级固件</strong><p id="air6OtaConfirmText"></p><label><input id="air6OtaKeep" type="checkbox" checked> 保留当前配置</label><p id="air6OtaResetWarning" class="air6-ota-warning" style="display:none">不保留配置会恢复出厂设置，请先备份。</p><div class="air6-actions"><button id="air6OtaConfirmCancel">取消</button><button id="air6OtaConfirmSubmit" class="air6-primary">开始升级</button></div></div>';
  document.body.appendChild(otaOverlay);document.body.appendChild(otaConfirm);
  let otaState={},otaBusy=false,otaPrompted='',otaRequestKind='',otaError='',otaCheckedAt=0;
  el('air6OtaMessage').setAttribute('role','status');el('air6OtaMessage').setAttribute('aria-live','polite');
  const otaClose=()=>{otaOverlay.classList.remove('active');_mDel('air6Ota');send('lanOtaWatch',{open:false});};
  const otaConfirmClose=()=>{otaConfirm.classList.remove('active');_mDel('air6OtaConfirm');};
  const otaSend=(kind,data={})=>{if(otaBusy)return;otaBusy=true;otaRequestKind=kind;otaError='';renderOta(otaState,false);send('air6Ota',Object.assign({kind},data));};
  const otaSize=value=>Number(value)>0?(Number(value)/1048576).toFixed(1)+' MiB':'--';
  function otaHasNew(data){
    const latest=(data.releases||[]).find(r=>r.sha256===data.latest_sha256),current=Number(data.current_epoch),epoch=Number(latest?.build_epoch);
    if(current>0&&epoch>0)return epoch>current;
    return data.supported!==false&&!!data.latest_version&&!!data.current_version&&data.latest_version!==data.current_version;
  }
  function renderOta(data,prompt){
    otaState=data||{};const current=String(otaState.current_version||'未知'),latest=String(otaState.latest_version||'尚未检查'),phase=String(otaState.phase||''),hasNew=otaState.supported!==false&&otaHasNew(otaState);
    setOtaBadge(active&&hasNew);
    otaEntry.style.display=active&&hasNew?'flex':'none';
    el('air6OtaCurrent').textContent=current;el('air6OtaLatest').textContent=latest;el('air6OtaSize').textContent=otaSize(otaState.size);
    const status=el('air6OtaMessage'),waiting=otaBusy&&otaRequestKind==='check'||phase==='checking',checked=otaCheckedAt?' · '+new Date(otaCheckedAt).toLocaleTimeString('zh-CN')+' 已检查':'';
    const summary=hasNew?'发现新版本 '+latest:latest!=='尚未检查'&&current===latest?'当前已是最新版本':'点击检查更新';
    status.textContent=otaError?'检查失败：'+otaError:waiting?'正在检查更新…':otaState.supported===false?'暂不支持在线升级':summary+checked+(otaState.message&&!(hasNew&&phase==='available'&&/^发现新固件/.test(otaState.message))?'\n'+otaState.message:'');
    if(!otaError&&['downloading','validating','flashing'].includes(phase)&&Number.isFinite(Number(otaState.progress)))status.textContent+='\n进度 '+Math.max(0,Math.min(100,Number(otaState.progress)))+'%';
    status.classList.toggle('is-error',!!otaError);status.classList.toggle('has-update',hasNew&&!otaError&&!waiting);
    el('air6OtaEntryStatus').textContent=otaError?'状态读取失败，点击重试':waiting?'正在检查更新…':summary;
    otaEntry.classList.toggle('has-update',hasNew);
    const notes=el('air6OtaNotes'),notesText=String(otaState.notes||'暂无更新说明'),notesToggle=el('air6OtaNotesToggle');if(notes.textContent!==notesText){notes.textContent=notesText;notes.classList.remove('expanded');notesToggle.textContent='展开更新说明';}notesToggle.style.display=notesText.length>120||notesText.split('\n').length>4?'block':'none';
    const history=el('air6OtaHistory'),releases=Array.isArray(otaState.releases)?otaState.releases:[];history.textContent='';for(const item of releases){const option=document.createElement('option');option.value=item.sha256||'';option.textContent=item.version+(item.build_epoch===otaState.current_epoch?'（当前版本）':item.sha256===otaState.latest_sha256?'（最新版）':'');option.disabled=item.build_epoch===otaState.current_epoch;history.appendChild(option);}history.value=otaState.sha256||'';history.disabled=otaBusy||!releases.length;
    el('air6OtaCheck').disabled=otaBusy||otaState.busy||otaState.supported===false||Number(otaState.retry_after)>0;el('air6OtaCheck').textContent=waiting?'正在检查更新…':Number(otaState.retry_after)>0?'检查更新（'+otaState.retry_after+'秒）':'检查更新';el('air6OtaDownload').disabled=otaBusy||!!otaError||otaState.busy||!otaState.sha256||phase!=='available';el('air6OtaUpgrade').disabled=otaBusy||!!otaError||otaState.busy||!otaState.sha256||phase!=='ready';el('air6OtaUpgrade').textContent=otaState.is_downgrade?'回退并重启':'升级并重启';
    if(prompt&&hasNew&&otaPrompted!==latest){otaPrompted=latest;otaOverlay.classList.add('active');_mAdd('air6Ota');}
    send('lanOtaWatch',{open:otaOverlay.classList.contains('active'),busy:!!otaState.busy||Number(otaState.retry_after)>0||['checking','downloading','validating','flashing'].includes(phase)});
  }
  el('air6OtaClose').onclick=otaClose;otaOverlay.onclick=event=>{if(event.target===otaOverlay)otaClose();};el('air6OtaCheck').onclick=()=>otaSend('check');el('air6OtaDownload').onclick=()=>otaSend('download');
  el('air6OtaNotesToggle').onclick=()=>{const notes=el('air6OtaNotes'),expanded=notes.classList.toggle('expanded');el('air6OtaNotesToggle').textContent=expanded?'收起更新说明':'展开更新说明';};
  el('air6OtaHistory').onchange=()=>{const sha256=el('air6OtaHistory').value;if(sha256)otaSend('select',{sha256});};
  el('air6OtaUpgrade').onclick=()=>{const rollback=otaState.is_downgrade===true;el('air6OtaConfirmTitle').textContent=rollback?'确认回退固件':'确认升级固件';el('air6OtaConfirmText').textContent=(rollback?'即将回退到 ':'即将升级到 ')+(otaState.version||otaState.latest_version||'所选版本')+'。操作期间网络会中断，请保持电源连接。';el('air6OtaKeep').checked=true;el('air6OtaResetWarning').style.display='none';el('air6OtaConfirmSubmit').textContent=rollback?'开始回退':'开始升级';otaConfirm.classList.add('active');_mAdd('air6OtaConfirm');};
  el('air6OtaKeep').onchange=()=>{el('air6OtaResetWarning').style.display=el('air6OtaKeep').checked?'none':'';};el('air6OtaConfirmCancel').onclick=otaConfirmClose;otaConfirm.onclick=event=>{if(event.target===otaConfirm)otaConfirmClose();};el('air6OtaConfirmSubmit').onclick=()=>{const sha256=String(otaState.sha256||'');if(!/^[a-f0-9]{64}$/i.test(sha256))return showUpdateToast('固件校验值无效','warning');const keep=el('air6OtaKeep').checked,rollback=otaState.is_downgrade===true;otaConfirmClose();otaSend('upgrade',{keep,sha256,rollback});};
  window.openAir6Ota=()=>{if(!active)return;renderOta(otaState,false);otaOverlay.classList.add('active');_mAdd('air6Ota');otaSend('status');};
  window.closeAir6Ota=otaClose;window.closeAir6OtaConfirm=otaConfirmClose;
  window.air6OtaData=result=>{if(!active)return;if(otaBusy&&result?.kind==='status'&&otaRequestKind!=='status')return;const requested=otaBusy;otaBusy=false;otaRequestKind='';if(!result?.ok){otaError=result?.message||'在线升级状态读取失败';renderOta(otaState,false);return;}if(requested||result.kind!=='status')otaError='';if(result.kind==='check')otaCheckedAt=Date.now();if(result.kind==='upgrade'){otaClose();showUpdateToast('已提交升级，请保持供电，等待重启','success');return;}renderOta(result.data,activePageId==='settings');};
  const wifiSection=document.createElement('section');wifiSection.dataset.air6Section='wifi';wifiSection.innerHTML='<p class="air6-hint">保存后 Wi-Fi 会重新连接。密码留空则不修改。</p><div id="air6WifiNetworks"></div>';panel.querySelector('.air6-modal-content').insertBefore(wifiSection,el('air6Result'));
  const cells=document.createElement('div');cells.innerHTML='<h3 class="air6-cell-heading">多小区锁定列表 <span id="air6CellDraftCount"></span></h3><textarea id="air6Cells" style="display:none"></textarea><button id="air6CellAddManual">将上方小区加入列表</button><div id="air6CellDraftRows"></div><p class="air6-hint air6-cell-help">添加后点“锁定多小区”生效；清空仅清空待提交列表。</p><div class="air6-actions"><button id="air6CellsSave" class="air6-primary">锁定多小区</button><button id="air6CellsClear">清空列表</button></div><details id="air6DeviceCellDetails"><summary id="air6DeviceCellSummary">设备当前多小区锁定：待读取</summary><div id="air6DeviceCellRows"></div><button id="air6CellsFromDevice">复制到待提交列表</button></details><h3 id="air6LockNeighborsTitle" class="air6-cell-heading">邻区信息</h3><div id="air6LockNeighbors"></div>';panel.querySelector('[data-air6-section="cell"]').appendChild(cells);
  for(const [section,id] of [['clients','air6Clients'],['wan','air6Wan']]){const node=document.createElement('section');node.dataset.air6Section=section;const content=document.createElement('div');content.id=id;node.appendChild(content);panel.querySelector('.air6-modal-content').insertBefore(node,el('air6Result'));}
  const advancedRows=[];
  const advancedIcons={
    scheduler:['icon-blue','M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm1 4v6l4 2-1 2-5-3V6z'],
    cfun:['icon-blue','M11 2h2v10h-2zM6.3 5.3l1.4 1.4a7 7 0 1 0 8.6 0l1.4-1.4a9 9 0 1 1-11.4 0z'],
    usb:['icon-teal','M11 3l-2 3h2v8H8V9H5v3h2v3h4v3a2 2 0 1 0 2 0v-6h4V8h2V5h-4v3h1v3h-3V6h2l-3-4z'],
    imei:['icon-orange','M6 2h9l4 4v16H6zm2 3v14h9V7h-4V5zm1 5h2v2H9zm4 0h2v2h-2zm-4 4h2v2H9zm4 0h2v2h-2z'],
    smsconfig:['icon-green','M3 3h18v14H8l-5 4zm3 4v2h12V7zm0 4v2h9v-2z'],
    rf:['icon-purple','M11 14h2v8h-2zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM6.3 5.3l1.4 1.4a7.5 7.5 0 0 0 0 10.6l-1.4 1.4a9.5 9.5 0 0 1 0-13.4zm11.4 0a9.5 9.5 0 0 1 0 13.4l-1.4-1.4a7.5 7.5 0 0 0 0-10.6z']
  };
  advancedIcons.failover=advancedIcons.scheduler;
  function insertAdvancedRow(row,kind){
    const [color,path]=advancedIcons[kind],icon=document.createElement('div');icon.className='row-icon '+color;
    icon.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="'+path+'"></path></svg>';
    const left=row.querySelector('.row-left');left.insertBefore(icon,left.firstChild);
    const right=row.querySelector('.row-right'),old=right.querySelector('.row-chevron');if(old)old.remove();
    const chevron=document.createElementNS('http://www.w3.org/2000/svg','svg');chevron.setAttribute('class','chevron');chevron.setAttribute('viewBox','0 0 24 24');chevron.innerHTML='<path d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6-1.41-1.41z"></path>';right.appendChild(chevron);
    const list=el('advSectionList');list.insertBefore(row,el('cardStyleRow'));
    advancedRows.push(row);
  }
  const advancedSpecs={
    cfun:{title:'CFUN 功能模式',hint:'全功能、飞行模式、关闭射频',field:'<input id="air6CfunMode" type="hidden"><div class="air6-cfun-segments"><button type="button" data-cfun="1">全功能</button><button type="button" data-cfun="0">飞行模式</button><button type="button" data-cfun="4">关闭射频</button></div>'},
    usb:{title:'USB 功能模式',hint:'RC 主机 / EP 设备',field:'<select id="air6UsbMode"><option value="rc">RC · USB 主机</option><option value="ep">EP · USB 设备</option></select><p class="air6-hint">EP 模式将 RNDIS 接入 LAN。保存模式与当前运行模式分别显示；需要重启时由你主动选择重启。</p>'},
    imei:{title:'IMEI',hint:'读取与修改模组 IMEI',field:'<input id="air6Imei" inputmode="numeric" maxlength="15" placeholder="15 位 IMEI"><p class="air6-hint">写入前请核对号码；修改可能影响设备联网。</p>'}
  };
  for(const [kind,spec] of Object.entries(advancedSpecs)){
    const section=document.createElement('section');section.dataset.air6Section=kind;section.innerHTML='<p id="air6AdvancedCurrent_'+kind+'" class="air6-hint">待读取</p><label>'+({cfun:'设置模式',usb:'设置模式',imei:'新 IMEI'}[kind])+spec.field+'</label><button id="air6AdvancedSave_'+kind+'" class="air6-primary"'+(kind==='cfun'?' style="display:none"':'')+'>保存</button>';
    if(kind==='cfun'){const group=section.querySelector('label');const wrapper=document.createElement('div');while(group.firstChild)wrapper.appendChild(group.firstChild);group.replaceWith(wrapper);}
    panel.querySelector('.air6-modal-content').insertBefore(section,el('air6Result'));
    const row=document.createElement('div');row.className='ios-row clickable';row.id='air6AdvancedRow_'+kind;row.style.display='none';row.innerHTML='<div class="row-left"><div class="row-title"><span class="row-main-title">'+spec.title+'</span><span class="row-sub-title">'+spec.hint+'</span></div></div><div class="row-right"><span id="air6AdvancedStatus_'+kind+'">点击查看</span><span class="row-chevron"></span></div>';row.onclick=()=>open(kind);insertAdvancedRow(row,kind);
    el('air6AdvancedSave_'+kind).onclick=()=>{const value=el({cfun:'air6CfunMode',usb:'air6UsbMode',imei:'air6Imei'}[kind]).value;run('air6AdvancedSave',{kind,value},{cfun:'切换功能模式会影响蜂窝连接，确定应用？',usb:'保存 USB 模式可能需要重启后生效，确定继续？',imei:'确认将 IMEI 写入为 '+value+'？'}[kind]);};
  }
  panel.querySelectorAll('[data-cfun]').forEach(button=>button.onclick=()=>run('air6AdvancedSave',{kind:'cfun',value:button.dataset.cfun},'切换至'+button.textContent+'将影响蜂窝网络，确定继续？'));
  const smsConfigFields=[
    ['forward_enable','转发到号码','checkbox'],['forward_number','转发号码','text'],['serverchan_enable','Server 酱推送','checkbox'],['serverchan_sendkey','Server 酱 SendKey','password'],['email_enable','邮箱推送','checkbox'],['email_smtp_server','SMTP 服务器','text'],['email_smtp_port','SMTP 端口','number',587],['email_smtp_security','SMTP 安全模式',['starttls','ssl','none'],'starttls'],['email_smtp_user','SMTP 账号','text'],['email_smtp_password','SMTP 密码','password'],['email_from','发件地址','text'],['email_to','收件地址','text'],['email_subject','邮件主题','text','CModem SMS'],['delete_rule','自动清理规则',['none','forward_success_oldest','low_space_forwarded_oldest','archive_local_oldest'],'none'],['cleanup_threshold','清理阈值（50–100%）','number',90],['cleanup_keep','保留条数（0–500）','number',20]
  ];
  let smsConfigBaseline={};
  function syncSmsConfigFields(){
    const phone=el('air6SmsCfg_forward_enable').checked,push=el('air6SmsCfg_serverchan_enable').checked,email=el('air6SmsCfg_email_enable').checked,rule=el('air6SmsCfg_delete_rule').value;
    for(const [key] of smsConfigFields){
      const input=el('air6SmsCfg_'+key);let visible=true;
      if(key==='forward_number')visible=phone;
      if(key==='serverchan_sendkey')visible=push;
      if(key.startsWith('email_')&&key!=='email_enable')visible=email;
      if(key==='cleanup_threshold')visible=rule==='low_space_forwarded_oldest';
      if(key==='cleanup_keep')visible=['low_space_forwarded_oldest','archive_local_oldest'].includes(rule);
      input.parentElement.style.display=visible?'':'none';
    }
  }
  const smsConfig=document.createElement('section');smsConfig.dataset.air6Section='smsconfig';smsConfig.innerHTML='<p id="air6SmsStorageStatus" class="air6-hint"></p><label>短信存储位置<select id="air6SmsStorage"><option value="SIM">SIM 卡</option><option value="ME">模组存储</option><option value="MT">全部存储</option></select></label><button id="air6SmsStorageSave">应用存储位置</button><p class="air6-hint">可同时启用多种转发方式。自动清理会删除或归档短信。</p><div id="air6SmsConfigFields"></div><button id="air6SmsConfigSave" class="air6-primary">保存短信设置</button>';
  panel.querySelector('.air6-modal-content').insertBefore(smsConfig,el('air6Result'));
  for(const [key,label,type,defaultValue] of smsConfigFields){const wrap=document.createElement('label');wrap.textContent=label;const input=document.createElement(Array.isArray(type)?'select':'input');input.id='air6SmsCfg_'+key;if(Array.isArray(type)){for(const value of type){const opt=document.createElement('option');opt.value=value;opt.textContent=({none:key==='delete_rule'?'不自动删除':'不加密',ssl:'SSL/TLS',starttls:'STARTTLS',forward_success_oldest:'转发成功后删除最早短信',low_space_forwarded_oldest:'空间不足清理已转发短信',archive_local_oldest:'转存本地并清理'})[value]||value;input.appendChild(opt);}}else{input.type=type;if(type==='checkbox')input.style.cssText='width:20px;margin-left:10px';}if(type==='password')input.autocomplete='new-password';wrap.appendChild(input);el('air6SmsConfigFields').appendChild(wrap);}
  el('air6SmsStorageSave').onclick=()=>run('air6ExtraSave',{kind:'storage',mode:el('air6SmsStorage').value},'切换短信存储位置，确定应用？');
  for(const key of ['forward_enable','serverchan_enable','email_enable','delete_rule'])el('air6SmsCfg_'+key).onchange=()=>{if(key==='delete_rule'&&el('air6SmsCfg_delete_rule').value==='archive_local_oldest')el('air6SmsCfg_cleanup_keep').value='0';syncSmsConfigFields();};
  el('air6SmsConfigSave').onclick=()=>{const patch={};for(const [key,,type] of smsConfigFields){const input=el('air6SmsCfg_'+key),value=type==='checkbox'?input.checked:type==='number'?Number(input.value):input.value;if(String(value)!==String(smsConfigBaseline[key]))patch[key]=value;}run('air6ExtraSave',{kind:'smsconfig',patch},'保存后设备将按所选规则转发、归档或清理短信，确定继续？');};
  const rf=document.createElement('section');rf.dataset.air6Section='rf';rf.innerHTML='<p class="air6-hint">调整功率可能损坏射频硬件。下方为待设置值，无法读取当前设置。</p><label>制式<select id="air6RfRat"><option value="nr">5G NR</option><option value="lte">4G LTE</option></select></label><label>功率（0–29 dBm）<input id="air6RfPower" type="number" min="0" max="29" value="26"></label><label>状态<select id="air6RfEnable"><option value="0">禁用</option><option value="1">启用</option></select></label><button id="air6RfSave" class="air6-primary">应用射频功率</button>';
  panel.querySelector('.air6-modal-content').insertBefore(rf,el('air6Result'));el('air6RfSave').onclick=()=>run('air6ExtraSave',{kind:'rf',rat:el('air6RfRat').value,power:el('air6RfPower').value,enable:el('air6RfEnable').value},'修改射频功率可能损坏硬件，确定下发当前参数？');
  for(const [kind,title,hint] of [['smsconfig','短信设置','存储位置、转发、自动清理'],['rf','射频功率','自定义 4G / 5G 发射功率']]){const row=document.createElement('div');row.id='air6AdvancedRow_'+kind;row.className='ios-row clickable';row.style.display='none';row.innerHTML='<div class="row-left"><div class="row-title"><span class="row-main-title">'+title+'</span><span class="row-sub-title">'+hint+'</span></div></div><div class="row-right"><span class="row-chevron"></span></div>';row.onclick=()=>open(kind);insertAdvancedRow(row,kind);}
  const style=document.createElement('style');style.textContent='.air6-modal-head{display:flex;align-items:center;justify-content:space-between;padding:18px 16px 12px;font-size:17px}.air6-modal-content{padding:0 16px;overflow-y:auto;max-height:65vh;min-height:0}.air6-modal-content section{display:none}.air6-modal-content label{display:block;margin:12px 0;font-size:13px}.air6-modal-content input,.air6-modal-content select,.air6-modal-content textarea{box-sizing:border-box;width:100%;min-width:0;padding:11px;margin-top:8px;border-radius:10px;border:1px solid var(--ios-border);background:var(--ios-bg);color:var(--ios-text);font-size:15px}#air6Control button{padding:10px 12px;border:0;border-radius:999px;background:var(--ios-bg);color:var(--ios-primary);font-size:14px;cursor:pointer}#air6Control button.air6-primary{background:var(--ios-primary);color:#fff}#air6Control button:disabled{opacity:.45}.air6-actions,.air6-modal-foot{display:flex;gap:10px;margin:14px 0}.air6-actions button,.air6-modal-foot button{flex:1;min-width:0}.air6-modal-foot{padding:0 16px;margin-bottom:16px}.air6-hint{font-size:12px;color:var(--ios-text-secondary);line-height:1.7;overflow-wrap:anywhere}.air6-chips{display:flex;flex-wrap:wrap;gap:6px}#air6Control .air6-chips button{padding:6px 9px;border:1px solid var(--ios-border);font-size:12px}#air6Control .air6-chips button.selected{border-color:var(--ios-primary);background:var(--ios-primary-soft)}.air6-card{background:var(--ios-card-bg);padding:14px;margin:10px 0;border-radius:14px;min-width:0;overflow-wrap:anywhere}.air6-card p{margin:0 0 8px}.air6-card .air6-hint{white-space:pre-line;margin-bottom:0}.air6-unavailable{display:none!important}.air6-unavailable .row-right>:not(.air6-note){display:none!important}.air6-note{font-size:11px;color:var(--ios-text-tertiary)}body[data-lan-device="air6"] #atRow{display:flex!important}';document.head.appendChild(style);
  let loaded=false,dirty=false,controlState=null,controlSummaryState=null,currentSection='rat',requestSequence=0,currentRequestId='',currentPanelAction='';
  for(const [kind,title,hint] of [['scheduler','定时任务','任务与执行记录'],['failover','自动回退','锁频、小区锁定保护']]){
    const section=document.createElement('section');section.dataset.air6Section=kind;section.innerHTML='<div id="air6State_'+kind+'"></div>';panel.querySelector('.air6-modal-content').insertBefore(section,el('air6Result'));
    const row=document.createElement('div');row.id='air6AdvancedRow_'+kind;row.className='ios-row clickable';row.style.display='none';row.innerHTML='<div class="row-left"><div class="row-title"><span class="row-main-title">'+title+'</span><span class="row-sub-title">'+hint+'</span></div></div><div class="row-right"></div>';row.onclick=()=>open(kind);insertAdvancedRow(row,kind);
  }
  window.__air6Automation=Air6AutomationUI.create({scheduler:panel.querySelector('[data-air6-section="scheduler"]'),failover:panel.querySelector('[data-air6-section="failover"]'),busy:()=>busy,editing:value=>{dirty=value;},message:text=>{el('air6Result').textContent=text;},save:(data,confirm)=>run('air6ExtraSave',data,confirm),preview:data=>send('air6TaskPreview',data)});
  window.air6TaskPreviewData=result=>window.__air6Automation.preview(result);
  let globalSnapshot={};
  window.air6GlobalSnapshot=result=>{if(active)globalSnapshot=result||{};};

  const accepts=result=>result?.requestId?result.requestId===currentRequestId:!panel.classList.contains('active');
  function dispatchPanel(action,data){currentPanelAction=action;currentRequestId='air6-ui-'+(++requestSequence);send(action,Object.assign({},['cfun','usb','imei','rf','smsconfig','scheduler','failover'].includes(currentSection)?{kind:currentSection}:{},action==='air6ReadControls'?{section:currentSection}:{},currentSection==='scheduler'&&action==='air6ExtraRead'?{withOptions:window.__air6Automation?.withOptions()}: {},data,{requestId:currentRequestId}));}
  const readAction=section=>({wifi:'air6WifiLoad',clients:'air6Clients',wan:'wanInfo',cfun:'air6AdvancedRead',usb:'air6AdvancedRead',imei:'air6AdvancedRead',rf:'air6ExtraRead',smsconfig:'air6ExtraRead',scheduler:'air6ExtraRead',failover:'air6ExtraRead'}[section]||'air6ReadControls');
  const ratLabels={'1':'仅 3G','3':'仅 4G','15':'仅 5G','19':'4G + 5G','21':'自动（3G/4G/5G）'};
  const ratSummary=rat=>String(rat)==='21'?'自动':ratLabels[rat];
  const refreshNet=window.refreshNetSettingText;
  window.refreshNetSettingText=function(...args){if(active){el('netSettingText').textContent=controlSummaryState?.errors?.rat?'读取失败':controlSummaryState?.loading?'读取中…':ratSummary(controlSummaryState?.rat??controlState?.rat)||'待读取';return;}return refreshNet?.apply(this,args);};
  const unavailable=new Map();
  function markUnavailable(enabled){
    const ids=['fanRow'];
    const selectors=['[onclick="openTrafficModal()"]','[onclick="openRebootModal()"]'];
    // These FiberHome identity fields do not exist anywhere in the Air6 LuCI
    // or cmodem pages. Keep fields that the Web UI does expose (model,
    // firmware, kernel, modem/IMEI/baseband and WAN).
    const missingAir6Info=['setPhone','setSn','setImsi','setMac'].map(id=>el(id)?.closest('.ios-row'));
    const rows=[document.querySelector('#page-settings [onclick="openWebLoginModal()"]'),...missingAir6Info,...ids.map(el),...selectors.map(q=>document.querySelector('#page-control '+q)),...['caSwitch','ledToggleSwitch'].map(id=>el(id)?.closest('.ios-row'))].filter(Boolean);
    for(const row of rows){
      if(!unavailable.has(row)){
        const right=row.querySelector('.row-right')||row,note=document.createElement('span');note.className='air6-note';note.textContent='暂未适配';right.appendChild(note);
        const fields=[...row.querySelectorAll('input,button')].map(n=>[n,n.disabled]);unavailable.set(row,{note,fields,display:row.style.display});
        row.addEventListener('click',event=>{if(active){event.preventDefault();event.stopImmediatePropagation();showUpdateToast('此功能请在路由器管理页使用','warning');}},true);
      }
      const {note,fields,display}=unavailable.get(row);row.classList.toggle('air6-unavailable',enabled);row.style.display=enabled?'none':display;note.style.display='none';
      for(const [field,disabled] of fields)field.disabled=enabled||disabled;
    }
  }
  function setBusy(value){busy=value;panel.querySelectorAll('input,select,textarea,button').forEach(n=>{n.disabled=n.dataset.permanentDisabled==='1'||!['air6Close','air6Cancel'].includes(n.id)&&(value||(!loaded&&n.id!=='air6Read'));});syncCellActions();}
  function clearPanelSecrets(){
    panel.querySelectorAll('input[type="password"]').forEach(input=>{input.value='';});
    smsConfigBaseline={};wifiEditors.clear();
  }
  function close(){window.__air6Automation?.close();currentRequestId='closed-'+(++requestSequence);busy=false;clearPanelSecrets();panel.classList.remove('active');_mDel('air6Control');}
  window.closeAir6Control=close;
  function open(section){
    if(!active)return;clearPanelSecrets();busy=false;dirty=false;currentSection=section;loaded=['wifi','clients','wan','cfun','usb','imei','rf','smsconfig','scheduler','failover'].includes(section)?false:!!controlState;
    window.__air6Automation?.open(section);
    if(section==='wifi')el('air6WifiNetworks').textContent='';
    el('air6Title').textContent={rat:'网络设置',band:'频段锁定管理',cell:'小区锁定管理',wifi:'Wi-Fi 设置',clients:'接入设备（DHCP 租约）',wan:'WAN 信息',cfun:'CFUN 功能模式',usb:'USB 功能模式',imei:'IMEI',rf:'射频功率',smsconfig:'短信设置',scheduler:'定时任务',failover:'自动回退'}[section];
    panel.querySelectorAll('[data-air6-section]').forEach(n=>n.style.display=n.dataset.air6Section===section||section==='band'&&n.dataset.air6Section==='rat'?'block':'none');
    if(section==='cell')restoreCellDraft();panel.querySelector('.air6-modal-content').scrollTop=0;panel.classList.add('active');_mAdd('air6Control');
    if(!busy){setBusy(true);el('air6Result').textContent='正在读取…';dispatchPanel(readAction(section));}
  }
  for(const [name,section] of [['openLockBandModalSafe','band'],['openLockBandModal','band'],['openLockCellModalSafe','cell'],['openLockCellModal','cell'],['openNetSetting','rat'],['openWifiModal','wifi'],['openClientsModal','clients'],['openWanModal','wan']]){
    const original=window[name];window[name]=function(...args){return active?open(section):original.apply(this,args);};
  }
  el('air6Close').onclick=close;el('air6Cancel').onclick=close;panel.onclick=event=>{if(event.target===panel)close();};
  panel.addEventListener('keydown',event=>{if(event.key==='Escape')close();});
  const run=(action,data,confirmText)=>{
    if(busy||!active)return;if(confirmText&&!window.confirm(confirmText))return;
    setBusy(true);el('air6Result').textContent='正在处理…';dispatchPanel(action,data);
  };
  el('air6Read').onclick=()=>run(readAction(currentSection));
  window.air6RefreshOpenPanel=()=>{const input=document.activeElement;if(input&&panel.contains(input)&&/^(INPUT|SELECT|TEXTAREA)$/.test(input.tagName))return;if(active&&panel.classList.contains('active')&&!busy&&!dirty&&!otaConfirm.classList.contains('active')){const snapshot=globalSnapshot[currentSection],callback={scheduler:'air6ExtraData',failover:'air6ExtraData',smsconfig:'air6ExtraData',wifi:'air6WifiData',clients:'air6ClientsData',wan:'air6WanData'}[currentSection];if(snapshot&&callback){window[callback]({...snapshot,requestId:currentRequestId});return;}setBusy(true);dispatchPanel(readAction(currentSection));}};
  el('air6RatRead').onclick=()=>run('air6ReadControls');
  el('air6RatSave').onclick=()=>run('air6SetRat',{rat:el('air6Rat').value},'切换网络模式可能短暂断网，确定应用？');
  el('air6BandSave').onclick=()=>run('air6SetBands',{lte:el('air6Lte').value,nr:el('air6Nr').value},'保存频段会让模组重新搜网或重启，确定保存？');
  el('air6BandReset').onclick=()=>run('air6SetBands',{reset:true},'恢复设备支持的全部频段，确定继续？');
  el('air6CellSave').onclick=()=>run('air6SetCell',{rat:el('air6CellRat').value,arfcn:el('air6Arfcn').value,pci:el('air6Pci').value},'锁定后可能短暂断网，确定应用？');
  el('air6CellsSave').onclick=()=>run('air6SetCells',{cells:el('air6Cells').value},'应用多小区锁定可能短暂断网，确定保存？');
  function clearCellDraft(){el('air6Cells').value='';saveCellDraft();el('air6Result').textContent='多小区草稿已清空，设备锁定保持原状态';}
  el('air6CellsClear').onclick=clearCellDraft;
  el('air6CellsFromDevice').onclick=()=>{const lines=deviceCellLines(controlState?.multiple);el('air6Cells').value=[...new Set([...draftCellLines(),...lines])].join('\n');saveCellDraft();el('air6Result').textContent='已加入待提交列表，尚未修改设备';};
  el('air6CellReset').onclick=()=>run('air6UnlockCell',{},'解除单小区和多小区锁定，确定继续？');
  let draftScope='';
  const draftCellLines=()=>el('air6Cells').value.split(/\n/).map(v=>v.trim()).filter(Boolean);
  const deviceCellLines=m=>[...(m?.lte_cell_list||[]).map(v=>'LTE,'+v.earfcn+','+v.pci),...(m?.nr_cell_list||[]).map(v=>'NR,'+v.nr_arfcn+','+v.pci)];
  const cellLineLabel=line=>{const [rat,arfcn,pci]=line.split(',');return (rat==='NR'?'5G':'4G')+' · 频点 '+arfcn+' · PCI '+pci;};
  function syncCellActions(){
    const count=draftCellLines().length;
    el('air6CellsSave').disabled=busy||!loaded||!count;el('air6CellsClear').disabled=busy||!count;
    for(const button of el('air6LockNeighbors').querySelectorAll('[data-cell-line]')){const added=draftCellLines().includes(button.dataset.cellLine);button.textContent=added?'已添加':'添加';button.disabled=busy||!loaded||added;}
  }
  function renderDeviceCells(m){
    const lines=deviceCellLines(m);el('air6DeviceCellSummary').textContent=lines.length?'设备当前多小区锁定 · '+lines.length+' 个':'设备当前未锁定多小区';
    const box=el('air6DeviceCellRows');box.textContent='';for(const line of lines){const p=document.createElement('p');p.textContent=cellLineLabel(line);box.appendChild(p);}
    el('air6CellsFromDevice').style.display=lines.length?'':'none';
  }
  function cellQuality(value){
    const n=parseFloat(value);return !Number.isFinite(n)?['未知','unknown']:n>-70?['优秀','good']:n>=-85?['好','fair']:n>=-100?['一般','fair']:['差','poor'];
  }
  function renderLockCells(cells){
    const box=el('air6LockNeighbors');box.textContent='';const rows=cells.filter(c=>['nr','lte'].includes(c.rat));let neighborIndex=0;
    el('air6LockNeighborsTitle').textContent='邻区信息（'+rows.length+' 个小区）';
    for(const c of rows){
      const row=document.createElement('div');row.className='air6-lock-cell';
      const header=document.createElement('div');header.className='air6-lock-cell-head';const title=document.createElement('strong');title.textContent=(c.isServing?'服务小区':'邻区 '+(++neighborIndex))+' · '+(c.rat==='nr'?'5G':'4G')+' · '+c.band;
      const [quality,tone]=cellQuality(c.rsrp),badge=document.createElement('span');badge.className='air6-cell-quality '+tone;badge.textContent=quality;header.appendChild(title);header.appendChild(badge);row.appendChild(header);
      const identity=document.createElement('p');identity.className='air6-cell-identity';identity.textContent='PCI '+c.pci+' · 频点 '+c.earfcn;row.appendChild(identity);
      const metrics=document.createElement('div');metrics.className='air6-cell-metrics';
      for(const [key,label,unit]of [['rsrp','RSRP','dBm'],['rsrq','RSRQ','dB'],['sinr','SINR','dB']]){const metric=document.createElement('div'),name=document.createElement('span'),value=document.createElement('strong');name.textContent=label;const v=c[key];value.textContent=v!==null&&v!==undefined&&v!==''&&v!=='--'?v+' '+unit:'未上报';metric.appendChild(name);metric.appendChild(value);metrics.appendChild(metric);}row.appendChild(metrics);
      const actions=document.createElement('div');actions.className='air6-cell-buttons';const lock=document.createElement('button');lock.textContent='锁定';lock.onclick=()=>{el('air6CellRat').value=c.rat;el('air6Arfcn').value=c.earfcn;el('air6Pci').value=c.pci;dirty=true;run('air6SetCell',{rat:c.rat,arfcn:c.earfcn,pci:c.pci},'锁定此小区可能短暂断网，确定继续？');};
      const add=document.createElement('button');add.dataset.cellLine=c.rat.toUpperCase()+','+c.earfcn+','+c.pci;add.textContent='添加';add.onclick=()=>addCellDraft(c);actions.appendChild(lock);actions.appendChild(add);row.appendChild(actions);box.appendChild(row);
    }
    if(!rows.length)box.textContent='暂无小区数据';
  }
  function saveCellDraft(){
    const value=el('air6Cells').value;try{localStorage.setItem('air6_cell_draft_'+draftScope,value);}catch(_){}
    renderCellDraft();
  }
  function restoreCellDraft(){
    const scope=String(window.__lanWifiScope||'preview');if(scope===draftScope)return;draftScope=scope;
    try{el('air6Cells').value=localStorage.getItem('air6_cell_draft_'+draftScope)||'';}catch(_){el('air6Cells').value='';}
    renderCellDraft();
  }
  function renderCellDraft(){
    const box=el('air6CellDraftRows');box.textContent='';const lines=draftCellLines();el('air6CellDraftCount').textContent=lines.length?'（待提交 '+lines.length+' 个）':'';
    lines.forEach((line,index)=>{const row=document.createElement('div');row.className='air6-actions';const text=document.createElement('span');text.textContent=cellLineLabel(line);const remove=document.createElement('button');remove.textContent='移除';remove.onclick=()=>{lines.splice(index,1);el('air6Cells').value=lines.join('\n');saveCellDraft();};row.appendChild(text);row.appendChild(remove);box.appendChild(row);});
    if(!lines.length)box.textContent='尚未添加，请从下方小区点“添加”';syncCellActions();
  }
  function addCellDraft(cell){
    if(!['nr','lte'].includes(cell.rat)||!/^\d+$/.test(String(cell.earfcn))||!/^\d+$/.test(String(cell.pci))){showUpdateToast('该小区缺少有效频点或 PCI','warning');return;}
    restoreCellDraft();const line=cell.rat.toUpperCase()+','+cell.earfcn+','+cell.pci,lines=el('air6Cells').value.split(/\n/).map(v=>v.trim()).filter(Boolean);
    if(lines.includes(line)){showUpdateToast('该小区已在列表中','warning');return;}if(lines.length>=20){showUpdateToast('最多添加 20 个小区','warning');return;}
    lines.push(line);el('air6Cells').value=lines.join('\n');saveCellDraft();showUpdateToast('已加入待锁定列表','success');
  }
  el('air6Cells').addEventListener('input',saveCellDraft);
  el('air6CellAddManual').onclick=()=>addCellDraft({rat:el('air6CellRat').value,earfcn:el('air6Arfcn').value,pci:el('air6Pci').value});
  const useCurrent=document.createElement('button');useCurrent.textContent='使用当前';useCurrent.onclick=()=>{const c=(controlState?.cells||window.rawAllCellsData||[]).find(v=>v.isCarrier&&['nr','lte'].includes(v.rat));if(!c)return showUpdateToast('当前小区数据不可用','warning');el('air6CellRat').value=c.rat;el('air6Arfcn').value=c.earfcn;el('air6Pci').value=c.pci;dirty=true;};el('air6CellSave').parentNode.prepend(useCurrent);el('air6CellSave').parentNode.appendChild(el('air6CellReset'));
  const splitBands=value=>String(value||'').replace(/[BN]/gi,'').split(/[\s,/]+/).filter(Boolean);
  function chips(radio,support){
    const field=el(radio==='lte'?'air6Lte':'air6Nr'),group=el(radio==='lte'?'air6LteChips':'air6NrChips');group.textContent='';
    for(const value of splitBands(support)){
      const button=document.createElement('button');button.type='button';const checked=splitBands(field.value).includes(value);button.textContent=(checked?'☑ ':'☐ ')+(radio==='lte'?'B':'N')+value;button.setAttribute('aria-pressed',String(checked));button.classList.toggle('selected',checked);
      button.onclick=()=>{const values=new Set(splitBands(field.value));values.has(value)?values.delete(value):values.add(value);field.value=[...values].sort((a,b)=>Number(a)-Number(b)).join('/');dirty=true;chips(radio,support);};group.appendChild(button);
    }
  }
  panel.querySelectorAll('input,select,textarea').forEach(n=>n.addEventListener('input',()=>{dirty=true;if(controlState?.bands){chips('lte',controlState.bands.support_lte_band);chips('nr',controlState.bands.support_nr_band);}}));
  window.air6ControlData=data=>{
    if(!active||!accepts(data))return;loaded=true;
    if(data.section==='rat'||data.section==='band'){
      controlState=Object.assign({},controlState,data);const errors=Object.assign({},controlSummaryState?.errors);delete errors.rat;if(data.bands)delete errors.bands;controlSummaryState=Object.assign({},controlSummaryState,data,{loading:false,errors});
      if(!dirty){el('air6Rat').value=data.rat;if(data.bands){el('air6Lte').value=data.bands.current_lte_band||'';el('air6Nr').value=data.bands.current_nr_band||'';}}
      el('air6RatCurrent').textContent='当前制式：'+(ratLabels[data.rat]||'未知');
      if(data.bands){chips('lte',data.bands.support_lte_band);chips('nr',data.bands.support_nr_band);}
      window.air6ControlSummary(controlSummaryState);setBusy(false);el('air6Result').textContent='已读取设备当前配置';return;
    }
    controlState=data;controlSummaryState=data;const b=data.bands||{},s=data.single||{},m=data.multiple||{};
    if(!dirty){el('air6Rat').value=data.rat;el('air6Lte').value=b.current_lte_band||'';el('air6Nr').value=b.current_nr_band||'';el('air6CellRat').value=Number(s.act)===11?'nr':'lte';el('air6Arfcn').value=Number(s.lock_mode)>0?s.arfcn??'':'';el('air6Pci').value=Number(s.lock_mode)>0?s.pci??'':'';}

    const serving=(data.cells||[]).find(c=>c.isCarrier&&['nr','lte'].includes(c.rat));
    if(!dirty&&Number(s.lock_mode)===0&&serving){el('air6CellRat').value=serving.rat;el('air6Arfcn').value=serving.earfcn;el('air6Pci').value=serving.pci;}
    renderLockCells(data.cells||[]);renderDeviceCells(m);
    chips('lte',b.support_lte_band);chips('nr',b.support_nr_band);setBusy(false);
    const limited=['lte','nr'].some(r=>splitBands(b['current_'+r+'_band']).sort().join('/')!==splitBands(b['support_'+r+'_band']).sort().join('/'));
    el('lockedBandText').textContent=limited?'已限制频段':'全部频段';
    el('lockedCellText').textContent=Number(s.lock_mode)>0?'已锁定':Number(m.lte_cell_count)+Number(m.nr_cell_count)>0?'多小区锁定':'未锁定';
    el('netSettingText').textContent=ratSummary(data.rat)||'--';el('air6RatCurrent').textContent='当前制式：'+(ratLabels[data.rat]||'未知');
    el('air6CellState').textContent=(Number(s.lock_mode)>0?'单小区：'+(Number(s.act)===11?'NR':'LTE')+' / '+s.arfcn+' / PCI '+s.pci:'未锁定单小区')+'；多小区：LTE '+(m.lte_cell_count||0)+'，NR '+(m.nr_cell_count||0);
    el('air6Result').textContent='已读取设备当前配置';
  };
  window.air6ControlSummary=data=>{
    if(!active)return;
    controlSummaryState=data;
    if(data.loading){for(const id of ['lockedBandText','lockedCellText','netSettingText','air6AdvancedStatus_cfun','air6AdvancedStatus_usb','air6AdvancedStatus_imei'])el(id).textContent='读取中…';return;}
    const b=data.bands,s=data.single,m=data.multiple,errors=data.errors||{};
    for(const kind of ['cfun','usb','imei']){
      const value=data[kind],status=el('air6AdvancedStatus_'+kind);
      if(!value){if(errors[kind])status.textContent='读取失败';continue;}
      if(kind==='cfun')status.textContent=({'0':'飞行模式','1':'全功能','4':'关闭射频'})[String(value.mode)]||'未知';
      if(kind==='usb'){
        el('air6AdvancedRow_usb').style.display=value.supported===false?'none':'';
        const reboot=[true,1,'1','true'].includes(value.reboot_required)||!!(value.mode&&value.current_mode&&value.mode!==value.current_mode);
        status.textContent=({rc:'RC 主机',ep:'EP 设备'})[value.current_mode]||'未知';if(reboot)status.textContent+=' · 待重启';
      }
      if(kind==='imei'){const imei=String(value.imei||'');status.textContent=imei?imei.slice(0,4)+'…'+imei.slice(-4):'未读取';}
    }
    if(b){const limited=['lte','nr'].some(r=>splitBands(b['current_'+r+'_band']).sort().join('/')!==splitBands(b['support_'+r+'_band']).sort().join('/'));el('lockedBandText').textContent=limited?'已限制频段':'全部频段';}
    else if(errors.bands)el('lockedBandText').textContent='读取失败';
    if(data.rat!==undefined)el('netSettingText').textContent=ratSummary(data.rat)||'未知';
    else if(errors.rat)el('netSettingText').textContent='读取失败';
    if(s&&m)el('lockedCellText').textContent=Number(s.lock_mode)>0?'已锁定':Number(m.lte_cell_count)+Number(m.nr_cell_count)>0?'多小区锁定':'未锁定';
    else if(errors.single||errors.multiple)el('lockedCellText').textContent='读取失败';
  };
  window.air6WriteResult=result=>{if(!active||!accepts(result))return;setBusy(false);el('air6Result').textContent=result.message||'处理完成';showUpdateToast(result.message,result.ok?'success':'warning');if(result.ok){dirty=false;dispatchPanel('air6ReadControls');}};
  window.air6ExtraData=result=>{
    if(!active||!accepts(result))return;loaded=result.ok||!!result.config||result.kind==='rf'||!!result.operation&&loaded;setBusy(false);
    if(['scheduler','failover'].includes(result.kind)){el('air6Result').textContent=result.message||'';window.__air6Automation.render(result);return;}
    if(result.config){const previous=smsConfigBaseline;smsConfigBaseline={};for(const [key,,type,defaultValue] of smsConfigFields){
      const input=el('air6SmsCfg_'+key),raw=result.config[key]??defaultValue??'',value=type==='checkbox'?[true,1,'1','true'].includes(raw):type==='number'?Number(raw):String(raw);
      const current=type==='checkbox'?input.checked:type==='number'?Number(input.value):input.value;
      const edited=currentPanelAction==='air6ExtraRead'&&Object.prototype.hasOwnProperty.call(previous,key)&&String(current)!==String(previous[key]);
      if(!edited){if(type==='checkbox')input.checked=value;else input.value=String(value);}smsConfigBaseline[key]=value;
    }}
    if(result.storageMode)el('air6SmsStorage').value=result.storageMode;
    if(result.config)syncSmsConfigFields();
    if(result.storage)el('air6SmsStorageStatus').textContent='已用 '+(result.storage.used??'--')+' / 总容量 '+(result.storage.total??'--');
    el('air6Result').textContent=result.message||(result.ok?'已读取':'读取失败');
  };
  window.air6AdvancedData=result=>{
    if(!active||!accepts(result))return;loaded=!!result.data;setBusy(false);const kind=result.kind,data=result.data||{};
    if(kind==='usb'&&data.supported===false){el('air6AdvancedRow_usb').style.display='none';loaded=false;setBusy(false);}
    if(result.data){
      if(kind==='cfun'){const value=String(data.mode??'');el('air6CfunMode').value=value;const label={'0':'飞行模式','1':'全功能','4':'关闭射频'}[value]||'未知';el('air6AdvancedCurrent_cfun').textContent='当前：'+label;el('air6AdvancedStatus_cfun').textContent=label;panel.querySelectorAll('[data-cfun]').forEach(b=>b.classList.toggle('selected',b.dataset.cfun===value));}
      if(kind==='usb'){const label=value=>({rc:'RC 主机',ep:'EP 设备'}[value]||'未知');if(!dirty)el('air6UsbMode').value=data.mode||'';el('air6AdvancedCurrent_usb').textContent='当前运行：'+label(data.current_mode)+'；已保存：'+label(data.mode);el('air6AdvancedStatus_usb').textContent=label(data.current_mode);}
      if(kind==='imei'){const value=String(data.imei||'');if(!dirty)el('air6Imei').value=value;el('air6AdvancedCurrent_imei').textContent='当前：'+(value||'未读取');el('air6AdvancedStatus_imei').textContent=value?value.slice(0,4)+'…'+value.slice(-4):'未读取';}
    }
    el('air6Result').textContent=result.message||(result.ok?(result.rebootRequired?'已读取：保存模式需重启后生效':'已读取设备配置'):'读取失败');
  };
  const wifiEditors=new Map();
  function wifiDrafts(){
    const drafts=new Map();for(const [section,e] of wifiEditors){const patch={};for(const key of ['ssid','enabled','hidden']){const value=['enabled','hidden'].includes(key)?e[key].checked:e[key].value;if(value!==e.network[key])patch[key]=value;}if(e.password.value)patch.password=e.password.value;if(Object.keys(patch).length)drafts.set(section,patch);}return drafts;
  }
  window.air6WifiData=result=>{
    if(!active||!accepts(result))return;loaded=result.ok===true||wifiEditors.size>0;setBusy(false);const box=el('air6WifiNetworks');
    el('air6Result').textContent=result.ok?'已读取无线配置':result.message||'读取 Wi-Fi 失败';if(!result.ok)return;
    const drafts=wifiDrafts();box.textContent='';wifiEditors.clear();
    if(drafts.size)el('air6Result').textContent='已读取无线配置，保留尚未保存的修改';
    for(const network of result.networks||[]){
      const card=document.createElement('div');card.className='air6-card';
      const title=document.createElement('p');title.textContent=network.band+' · '+network.ssid;card.appendChild(title);
      const info=document.createElement('p');info.className='air6-hint';const encryption={'none':'开放网络','psk2':'WPA2 个人','psk2+ccmp':'WPA2 个人','sae':'WPA3 个人','sae+ccmp':'WPA3 个人','sae-mixed':'WPA2 / WPA3 个人'}[network.encryption]||'设备现有加密';info.textContent='加密：'+encryption+(network.radioDisabled?' · 无线电已关闭，请在设备管理页开启':'');card.appendChild(info);
      const input=(label,value,type)=>{const wrap=document.createElement('label');wrap.textContent=label;const n=document.createElement('input');n.type=type;n.value=value;wrap.appendChild(n);card.appendChild(wrap);return n;};
      const ssid=input('Wi-Fi 名称',network.ssid,'text'),password=input('新密码（留空保持）','','password');password.autocomplete='new-password';password.dataset.permanentDisabled=network.canSetPassword?'0':'1';password.disabled=!network.canSetPassword;
      const toggle=(label,value)=>{const wrap=document.createElement('label');wrap.style.cssText='display:flex;align-items:center;gap:10px';const n=document.createElement('input');n.type='checkbox';n.checked=value;n.style.cssText='width:20px;margin:0';wrap.appendChild(n);wrap.appendChild(document.createTextNode(label));card.appendChild(wrap);return n;};
      const enabled=toggle('启用此 Wi-Fi',network.enabled),hidden=toggle('隐藏 Wi-Fi 名称',network.hidden);
      const draft=drafts.get(network.section);if(draft){if(draft.ssid!==undefined)ssid.value=draft.ssid;if(draft.password&&network.canSetPassword)password.value=draft.password;if(draft.enabled!==undefined)enabled.checked=draft.enabled;if(draft.hidden!==undefined)hidden.checked=draft.hidden;}
      wifiEditors.set(network.section,{network,title,ssid,password,enabled,hidden});
      const save=document.createElement('button');save.className='air6-primary';save.textContent='保存 '+network.band;save.onclick=()=>{
        const changed=ssid.value!==network.ssid||enabled.checked!==network.enabled||hidden.checked!==network.hidden||!!password.value;
        if(!changed){el('air6Result').textContent=network.band+' 没有需要保存的修改';showUpdateToast('没有需要保存的修改','warning');return;}
        if(password.value&&(password.value.length<8||password.value.length>63)){el('air6Result').textContent='Wi-Fi 密码须为 8–63 位';showUpdateToast('Wi-Fi 密码须为 8–63 位','warning');return;}
        if(!window.confirm('应用后 Wi-Fi 将重新加载，手机可能断开。确定保存？'))return;
        run('air6WifiSave',{section:network.section,patch:{ssid:ssid.value,enabled:enabled.checked,hidden:hidden.checked,password:password.value}});
      };card.appendChild(save);box.appendChild(card);
    }
    if(!result.networks?.length)box.textContent='没有可编辑的 AP 无线网络';
  };
  const clearLocalCache=window.localCacheCleared;
  window.localCacheCleared=result=>{
    if(result?.ok){try{for(let i=localStorage.length-1;i>=0;i--){const key=localStorage.key(i);if(key?.startsWith('air6_cell_draft_'))localStorage.removeItem(key);}}catch(_){}draftScope='';el('air6Cells').value='';renderCellDraft();}
    return clearLocalCache?.(result);
  };
  window.air6WifiResult=result=>{
    if(!active||!accepts(result))return;setBusy(false);el('air6Result').textContent=result.message;showUpdateToast(result.message,result.ok?'success':'warning');
    const editor=wifiEditors.get(result.section),network=result.networks?.find(n=>n.section===result.section);
    if(result.ok&&editor&&network){Object.assign(editor.network,network);editor.title.textContent=network.band+' · '+network.ssid;editor.ssid.value=network.ssid;editor.password.value='';editor.enabled.checked=network.enabled;editor.hidden.checked=network.hidden;}
  };
  const readPanel=(id,result,lines)=>{if(!active||!accepts(result))return;loaded=!!result.ok;setBusy(false);const box=el(id);box.textContent='';for(const text of lines){const p=document.createElement('p');p.className='air6-hint';p.style.whiteSpace='pre-line';p.textContent=text;box.appendChild(p);}el('air6Result').textContent=result.ok?'已读取':result.message||'读取失败';};
  window.air6ClientsData=result=>{
    if(!active||!accepts(result))return;loaded=!!result.ok;setBusy(false);const box=el('air6Clients');box.textContent='';
    el('air6Result').textContent=result.ok?'已读取 '+(result.rows||[]).length+' 台租约设备':result.message||'读取失败';if(!result.ok)return;
    const note=document.createElement('p');note.className='air6-hint';note.textContent='按设备合并 IPv4 / IPv6 地址；租约不代表实时在线。';box.appendChild(note);
    for(const device of result.rows||[]){
      const row=document.createElement('div');row.className='air6-client-row';const head=document.createElement('div');head.className='air6-client-head';const name=document.createElement('strong');name.textContent=device.name||'未命名设备';const badge=document.createElement('span');badge.textContent='DHCP';head.appendChild(name);head.appendChild(badge);row.appendChild(head);
      for(const [label,values]of [['IPv4',device.ipv4||[]],['IPv6',device.ipv6||[]],['MAC',device.mac?[device.mac]:[]]])if(values.length){const line=document.createElement('div');line.className='air6-client-detail';const key=document.createElement('span'),value=document.createElement('span');key.textContent=label;value.textContent=values.join('\n');line.appendChild(key);line.appendChild(value);row.appendChild(line);}box.appendChild(row);
    }
    if(!result.rows?.length){const empty=document.createElement('p');empty.className='air6-hint';empty.textContent='暂无 DHCP 租约设备';box.appendChild(empty);}
  };
  window.air6WanData=result=>readPanel('air6Wan',result,(result.items||[]).map(v=>v.interface+' · '+(v.up?'已连接':'未连接')+' · '+v.proto+'\nIPv4: '+(v['ipv4-address']||[]).map(a=>a.address+'/'+a.mask).join(', ')+'\nIPv6: '+(v['ipv6-address']||[]).map(a=>a.address+'/'+a.mask).join(', ')+'\nDNS: '+(v['dns-server']||[]).join(', ')));
  let rebootPending=false;
  const reboot=window.confirmReboot;
  window.confirmReboot=()=>{if(!active)return reboot();closeRebootConfirm();if(rebootPending)return;rebootPending=true;showUpdateToast('正在提交重启命令…','warning');send('rebootDevice');};
  window.air6RebootResult=result=>{rebootPending=false;showUpdateToast(result.message,result.ok?'success':'warning');};
  let smsWriting=false,pendingSmsSend=null;
  window.__smsWriteBusy=()=>!!smsWriting;
  function smsWrite(action,payload,source){if(smsWriting)return;smsWriting=action;if(action==='smsSend')pendingSmsSend={source,number:payload.receiver,text:payload.msg};send(action,payload);}
  // Per-message card actions (sms_cards.js) reuse the same lock and result path.
  window.__smsWrite=(action,payload)=>{if(!active)return false;if(smsWriting){showUpdateToast('上一个短信操作尚未完成','warning');return true;}smsWrite(action,payload);return true;};
  const bulk=window.smsBatchOp,chatDelete=window.smsChatBatchDel,chatSend=window.smsSendMsg,compose=window.doSmsCompose;
  window.smsBatchOp=kind=>{
    if(!active)return bulk(kind);const recv=[],sent=[];
    for(const c of smsConversations?.convs||[])if(smsSelected['n|'+c.number]){recv.push(...c.recv.map(m=>({Index:m.Index})));sent.push(...c.send.map(m=>({Index:m.Index})));}
    if(!recv.length&&!sent.length)return showUpdateToast('请先选择短信','warning');
    if(kind!=='read'&&!window.confirm('删除所选短信？'))return;
    smsWrite(kind==='read'?'smsRead':'smsDelete',{recv,send:sent});
  };
  window.smsChatBatchDel=()=>{if(!active)return chatDelete();const recv=[],sent=[];for(const key of Object.keys(smsChatSelected||{}))if(smsChatSelected[key]){const split=key.indexOf('|');(key.slice(0,split)==='recv'?recv:sent).push({Index:key.slice(split+1)});}if((recv.length||sent.length)&&window.confirm('删除所选短信？'))smsWrite('smsDelete',{recv,send:sent});};
  window.smsSendMsg=()=>{if(!active)return chatSend();if(smsChat&&el('smsChatInput').value.trim())smsWrite('smsSend',{receiver:smsChat.number,msg:el('smsChatInput').value.trim()},'chat');};
  window.doSmsCompose=()=>{if(!active)return compose();smsWrite('smsSend',{receiver:el('smsComposeNum').value.trim(),msg:el('smsComposeMsg').value.trim()},'compose');};
  const buildSmsConversations=window.smsBuildConversations;
  window.smsBuildConversations=function(...args){
    const body=el('smsChatBody'),scrollTop=body?.scrollTop||0,atBottom=!body||body.scrollHeight-body.clientHeight-scrollTop<48;
    const result=buildSmsConversations.apply(this,args);
    if(active&&smsChat){const updated=smsConversations?.convs?.find(c=>c.number===smsChat.number);if(updated){smsChat=updated;renderSmsChat();if(body&&!atBottom)body.scrollTop=scrollTop;}}
    return result;
  };
  window.air6SmsResult=result=>{if(!active)return;
    if(result.type==='read'){
      const ids=new Set((result.recv||[]).map(v=>String(v?.Index??v)));
      for(const row of smsDetailsAcc.recv||[])if(ids.has(String(row.Index)))row.Isopened=result.ok?'1':result.readStates?.[row.Index]??row.Isopened;
      for(const chat of smsConversations?.convs||[]){for(const row of chat.recv||[])if(ids.has(String(row.Index)))row.Isopened=result.ok?'1':result.readStates?.[row.Index]??row.Isopened;chat.unread=(chat.recv||[]).filter(v=>String(v.Isopened)==='0').length;}
      if(smsChat){for(const row of smsChat.recv||[])if(ids.has(String(row.Index)))row.Isopened=result.ok?'1':result.readStates?.[row.Index]??row.Isopened;smsChat.unread=(smsChat.recv||[]).filter(v=>String(v.Isopened)==='0').length;}
      updateSmsBadge();smsPersistCache(true);if(!result.ok)showUpdateToast(result.message,'warning');if(smsWriting==='smsRead')smsWriting=false;return;
    }
    smsWriting=false;showUpdateToast(result.message,result.ok?'success':'warning');
    if(result.type==='send'){
      const pending=pendingSmsSend;pendingSmsSend=null;
      if(result.ok&&pending?.source==='chat'&&smsChat?.number===pending.number&&el('smsChatInput').value.trim()===pending.text)el('smsChatInput').value='';
      if(result.ok&&pending?.source==='compose'&&el('smsComposeNum').value.trim()===pending.number&&el('smsComposeMsg').value.trim()===pending.text){el('smsComposeMsg').value='';closeSmsCompose();}
    }
    if(result.ok){smsListEdit=false;smsSelected={};el('smsListActions').style.display='none';smsLoadedAt=0;smsDiffing=true;smsLoadList();}};
  const update=window.updateData,render=window.renderCells;
  window.renderCells=carriers=>{
    if(!active)return render(carriers);
    carriers=Array.isArray(carriers)?carriers:[];
    const cells=[...(rawAllCellsData||[])];
    // CA and cell measurements can arrive from different modem reports.
    carriers.forEach((cc,index)=>{
      if(cells.some(c=>c.isCarrier&&c.carrierIndex===index))return;
      cells.push({...cc,earfcn:cc.arfcn,isCarrier:true,carrierIndex:index,bandSource:'reported'});
    });
    const bands={ 'same-frequency':'同频',arfcn:'频点推算',candidates:'候选频段' };
    const rows=cells.map(c=>{
      const cc=c.isCarrier?carriers[c.carrierIndex]:null;
      const primary=cc?cc.type==='PCC':!!(c.isCarrier||c.isServing);
      const bandwidth=cc?.dlBandwidth||cc?.bandwidth;
      return {isCarrier:!!(c.isCarrier||c.isServing),carrierIndex:c.carrierIndex,primary,
        cellTitle:cc?'主载波':'服务小区',displayBand:_esc(c.band||'--'),
        cellDetails:[bandwidth,carriers.length?carriers.length+'CC':''].filter(v=>v&&v!=='--').map(v=>' | '+_esc(v)).join(''),
        channelLabel:({nr:'ARFCN',lte:'EARFCN',umts:'UARFCN',gsm:'ARFCN'})[c.rat]||'ARFCN',
        pci:_esc(c.pci),earfcn:_esc(c.earfcn),
        ...Object.fromEntries(['rsrp','sinr','rsrq'].map(key=>[key,_esc(c[key]&&c[key]!=='--'?c[key]:cc?.[key]??c[key]??'--')]))};
    });
    render(carriers.map(cc=>({bandwidth:_esc(cc.dlBandwidth||cc.bandwidth||'--')})),rows);
    const cards=[...el('servingCellsContainer').querySelectorAll('.cell-card')];
    const neighbors=[...el('neighborListContainer').querySelectorAll('.cell-card')];
    let si=0,ni=0;
    cells.forEach((c,index)=>{
      const card=rows[index].isCarrier?cards[si++]:neighbors[ni++];if(!card)return;
      const meta=card.querySelector('.cell-sub-line');
      if(meta&&bands[c.bandSource])meta.append(' | '+bands[c.bandSource]);
      if(!['nr','lte'].includes(c.rat))return;
      const add=document.createElement('button');add.type='button';add.className='air6-cell-add';
      add.textContent='+';add.title='加入多小区列表';add.setAttribute('aria-label','加入多小区列表，PCI '+c.pci);
      add.onclick=()=>addCellDraft(c);(card.querySelector('.cell-top')||card).appendChild(add);
    });
  };
  let overviewSignal=null;
  function renderAir6Signal(){
    const grid=el('gaugeGrid');if(!active||!overviewSignal||!grid||!document.body.classList.contains('card-header-pro'))return;
    grid.textContent='';
    for(const [key,label] of [['rsrp','RSRP'],['sinr','SINR'],['rsrq','RSRQ'],['rssi','RSSI']]){
      const value=String(overviewSignal[key]??'--'),color=window._gaugeColor(label,value),pct=Math.max(0,Math.min(1,Number(window._gaugePct(label,value))||0)),item=document.createElement('div');item.className='metric-item';
      item.innerHTML='<div class="gwrap"><svg width="52" height="52" viewBox="0 0 52 52" style="display:block;transform:rotate(135deg)"><circle cx="26" cy="26" r="20" fill="none" stroke="rgba(128,144,170,.18)" stroke-width="4.5" stroke-dasharray="94.25 125.66" stroke-linecap="round"/><circle cx="26" cy="26" r="20" fill="none" stroke="'+color+'" stroke-width="4.5" stroke-dasharray="'+(94.25*pct).toFixed(2)+' 125.66" stroke-linecap="round"/></svg><span class="gnum"></span></div><div class="metric-label"></div>';item.querySelector('.gnum').textContent=value;item.querySelector('.gnum').style.color=color;item.querySelector('.metric-label').textContent=label;grid.appendChild(item);
    }
  }
  function renderAir6Ca(){
    if(!active)return;
    renderAir6Signal();
    const colorful=document.body.classList.contains('card-header-pro');
    const container=el(colorful?'caRowList':'caCarriersList'),summary=el(colorful?'caRowSummary':'ca');if(!container||!summary)return;
    const carriers=window._lastCaCarriers||[];container.textContent='';summary.textContent=window._lastCaSummary||'--';
    if(!carriers.length){container.textContent='暂无载波数据';return;}
    let scc=0;
    const span=(cls,text)=>{const node=document.createElement('span');node.className=cls;node.textContent=text;return node;};
    for(const carrier of carriers){
      if(!colorful){
        const card=document.createElement('div');card.className='carrier-box air6-plain-carrier';
        const header=document.createElement('div');header.className='air6-plain-carrier-head';
        header.appendChild(span('carrier-badge '+(carrier.type==='PCC'?'badge-pcc':'badge-scc'),carrier.type==='PCC'?'PCC':'SCC'+(++scc)));
        header.appendChild(span('carrier-tag',carrier.band||'--'));
        // Bandwidth sits top-right, opposite the carrier label.
        const bandwidth=document.createElement('div');bandwidth.className='air6-plain-bandwidth';
        bandwidth.appendChild(span('', 'DL '+(carrier.dlBandwidth||'--')));bandwidth.appendChild(span('', 'UL '+(carrier.ulBandwidth||'--')));header.appendChild(bandwidth);card.appendChild(header);
        if(carrier.type==='PCC'){
          const grid=document.createElement('div');grid.className='metric-grid';
          for(const [key,label,color] of [['rsrp','RSRP',getRsrpColor],['sinr','SINR',getSinrColor],['rsrq','RSRQ',getRsrqColor],['rssi','RSSI',()=> 'var(--ios-text-secondary)']]){
            const item=document.createElement('div');item.className='metric-item';const value=span('metric-val',carrier[key]??'--');value.style.color=color(carrier[key]);item.appendChild(value);item.appendChild(span('metric-label',label));grid.appendChild(item);
          }
          card.appendChild(grid);
        }
        const footer=document.createElement('div');footer.className='air6-plain-carrier-meta';footer.appendChild(span('','PCI '+(carrier.pci??'--')));footer.appendChild(span('','ARFCN '+(carrier.arfcn??'--')));card.appendChild(footer);container.appendChild(card);continue;
      }
      const row=document.createElement('div');row.className='ca-row air6-carrier-row';
      const badge=document.createElement('span');badge.className='carrier-badge '+(carrier.type==='PCC'?'badge-pcc':'badge-scc');badge.textContent=carrier.type==='PCC'?'PCC':'SCC'+(++scc);row.appendChild(badge);
      for(const [cls,text] of [['ca-band',carrier.band||'--'],['ca-kv','PCI '+(carrier.pci??'--')],['ca-kv','ARFCN '+(carrier.arfcn??'--')]]){const span=document.createElement('span');span.className=cls;span.textContent=text;row.appendChild(span);}container.appendChild(row);
    }
  }
  const applyCards=window.applyHomeCards;
  window.applyHomeCards=function(...args){const result=applyCards?.apply(this,args);renderAir6Ca();return result;};
  const bytes=value=>{const n=Number(value);if(value==null||!Number.isFinite(n)||n<0)return '--';if(n<1000)return n.toFixed(0)+' B';if(n<1e6)return (n/1e3).toFixed(2)+' KB';if(n<1e9)return (n/1e6).toFixed(2)+' MB';if(n<1e12)return (n/1e9).toFixed(2)+' GB';return (n/1e12).toFixed(2)+' TB';};
  window.updateData=data=>{
    if(active&&data?.deviceOnline)overviewSignal={rsrp:data.rsrp,rsrq:data.rsrq,sinr:data.sinr,rssi:data.rssi};
    update(data);if(active&&data?.carriers)renderAir6Ca();
    if(active&&data?.deviceOnline){
      systemDescription=data.air6FirmwareFull||data.swVersion||'--';for(const id of ['air6Kernel','air6Baseband','air6Module']){const value=String(data[id]||'--');el(id).textContent=id==='air6Kernel'&&value!=='--'&&!/^Linux\b/i.test(value)?'Linux '+value:value;}
      const ota=data.air6Ota||{},current=String(ota.current_version||'');if(current){el('setSwVersion').textContent=current;el('setSwVersion').title=current;}if(Object.keys(ota).length)renderOta(ota,activePageId==='settings');
    }
    if(active&&data&&Object.prototype.hasOwnProperty.call(data,'downSpeed')&&(data.downSpeed===null||data.upSpeed===null)){
      try{_spLastRaw.down=data.downSpeed;_spLastRaw.up=data.upSpeed;_spRender(null,null);}catch(_){}
    }
    if(!active||!data?.air6Traffic)return;
    const t=data.air6Traffic,valid=t.total_rx!==undefined&&t.total_tx!==undefined;
    // cmodem cumulative counters are not calendar-month counters.
    el('totalTraffic').textContent=valid?bytes(Number(t.total_rx)+Number(t.total_tx)):'--';
    el('rxToday').textContent=bytes(t.total_rx);el('txToday').textContent=bytes(t.total_tx);
    const total=Number(t.total_rx)+Number(t.total_tx),percent=valid&&total>0?Math.round(Number(t.total_rx)/total*100):null;
    el('rxPercent').textContent=percent===null?'--':percent+'%';el('txPercent').textContent=percent===null?'--':(100-percent)+'%';
    el('progressDl').style.width=(percent??50)+'%';el('progressUl').style.width=(percent===null?50:100-percent)+'%';
    const daily=Array.isArray(data.air6Daily)?data.air6Daily:[],now=new Date();
    const key=''+now.getFullYear()+String(now.getMonth()+1).padStart(2,'0')+String(now.getDate()).padStart(2,'0');
    const today=daily.find(v=>String(v.date)===key);el('todayTotalText').textContent=today?bytes(Number(today.rx)+Number(today.tx)):'--';
  };
  window.lanDeviceType=type=>{
    active=type==='air6';globalSnapshot={};window.__air6Automation?.reset();overviewSignal=null;document.body.dataset.lanDevice=active?'air6':'fh';otaClose();otaConfirmClose();otaState={};otaPrompted='';otaBusy=false;otaError='';otaCheckedAt=0;otaEntry.style.display='none';setOtaBadge(false);close();loaded=false;dirty=false;controlState=null;controlSummaryState=null;setBusy(false);markUnavailable(active);if(active)for(const id of ['lockedBandText','lockedCellText','netSettingText'])el(id).textContent='待读取';
    window.__lanAir6Layout?.(active);
    arrangeControlRows(active);
    if(homeCardsSeen&&!homeCardsConfigured)applyHomeCards({header:active?'pro':'basic'});
    for(const row of systemRows)row.style.display=active?'':'none';
    arrangeSystemRows(active);
    if(firmwareRow){
      if(active){firmwareRow.removeAttribute('onclick');firmwareRow.onclick=()=>window.openAir6Ota();firmwareRow.classList.add('clickable','air6-ota-version-row');firmwareRow.style.cursor='pointer';firmwareRow.querySelector('.row-title')?.appendChild(firmwareBadge);}
      else{firmwareRow.onclick=null;if(firmwareRowAction)firmwareRow.setAttribute('onclick',firmwareRowAction);firmwareRow.classList.toggle('clickable',!!firmwareRowClickable);firmwareRow.classList.remove('air6-ota-version-row');firmwareRow.style.cursor='';if(firmwareBadge&&firmwareBadgeParent)firmwareBadgeParent.insertBefore(firmwareBadge,firmwareBadgeNext&&firmwareBadgeNext.parentNode===firmwareBadgeParent?firmwareBadgeNext:null);}
      const chevron=firmwareRow.querySelector('.chevron,.row-chevron');if(!active&&firmwareBadge){firmwareBadge.textContent=firmwareBadgeText;firmwareBadge.classList.remove('air6-ota-row-badge');firmwareBadge.style.display='';}if(chevron)chevron.style.display='';
    }
    for(const row of advancedRows)row.style.display=active?'':'none';
    for(const kind of ['cfun','usb','imei']){el('air6AdvancedStatus_'+kind).textContent='点击查看';el('air6AdvancedCurrent_'+kind).textContent='待读取';}el('air6Imei').value='';
    if(firmwareTitle)firmwareTitle.textContent=active?'系统与基带信息':firmwareTitleText;
    const wifiSubtitle=el('wifiSettingRow')?.querySelector('.row-sub-title');if(wifiSubtitle){if(!wifiSubtitle.dataset.fhText)wifiSubtitle.dataset.fhText=wifiSubtitle.textContent;wifiSubtitle.textContent=active?'无线网络名称、密码与开关':wifiSubtitle.dataset.fhText;}
    if(active){const row=document.querySelector('#page-control [onclick="openClientsModal()"] .row-sub-title');if(row){if(!row.dataset.fhText)row.dataset.fhText=row.textContent;row.textContent='查看 DHCP 租约与地址';}}else{const row=document.querySelector('#page-control [onclick="openClientsModal()"] .row-sub-title');if(row?.dataset.fhText)row.textContent=row.dataset.fhText;}
    smsWriting=false;pendingSmsSend=null;if(active)restoreCellDraft();
    // Clear shared topology/speed caches when switching between protocol families.
    try{_lastTopoVals={};cachedClients=[];_spLastRaw={down:null,up:null};}catch(_){}
    if(active){
      const labels={'本月流量':'累计流量','本月下载':'累计下载','本月上传':'累计上传'};
      for(const node of document.querySelectorAll('#page-overview *'))for(const text of node.childNodes){
        if(text.nodeType===3&&labels[text.textContent.trim()]){originalLabels.set(text,text.textContent);text.textContent=labels[text.textContent.trim()];}
      }
    }else{for(const [node,text] of originalLabels)node.textContent=text;originalLabels.clear();}
  };
  const hint=document.createElement('p');hint.className='air6-hint';hint.textContent='Air6 默认地址 192.168.1.1，账号 root。';el('localTestMsg')?.parentNode.appendChild(hint);
})();
