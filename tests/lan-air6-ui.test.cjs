const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const acorn=require('../tools/node_modules/acorn'),walk=require('../tools/node_modules/acorn-walk');
const source=fs.readFileSync(require('node:path').join(__dirname,'../app/src/main/assets/air6_ui.js'),'utf8');
const definitions=new Map();
walk.simple(acorn.parse(source,{ecmaVersion:'latest'}),{
  FunctionDeclaration(n){definitions.set(n.id.name,source.slice(n.start,n.end));},
  VariableDeclarator(n){if(n.id.type==='Identifier'&&n.init)definitions.set(n.id.name,'var '+source.slice(n.start,n.end)+';');},
  AssignmentExpression(n){if(n.left.type==='MemberExpression'&&n.left.object.name==='window')definitions.set(n.left.property.name,source.slice(n.start,n.end)+';');}
});
test('Air6 My page hides identity fields absent from the live LuCI and cmodem pages',()=>{
  assert.match(source,/missingAir6Info=\['setPhone','setSn','setImsi','setMac'\]/);
  assert.match(source,/row\.className='ios-row air6-system-row'/);
  for(const kept of ['setDeviceName','setDeviceModel','setSwVersion','setImei','setWanIp'])assert.doesNotMatch(source,new RegExp("missingAir6Info=\\[[^\\]]*'"+kept+"'"),kept);
});
test('Air6 My page orders WAN, kernel and baseband without changing FiberHome permanently',()=>{
  assert.match(source,/parent\.insertBefore\(wanRow,deviceModelRow\.nextSibling\)/);
  assert.match(source,/parent\.insertBefore\(kernel,firmwareRow\.nextSibling\)/);
  assert.match(source,/parent\.appendChild\(baseband\)/);
  assert.match(source,/wanParent\.insertBefore\(wanRow,wanNext/);
  assert.match(source,/arrangeSystemRows\(active\)/);
  assert.match(source,/id==='air6Kernel'.*\?\s*'Linux '\+value:value/);
});
test('Air6 firmware row opens OTA directly and newer versions mark both entry points',()=>{
  assert.match(source,/firmwareRow\.removeAttribute\('onclick'\)/);assert.match(source,/firmwareRow\.onclick=\(\)=>window\.openAir6Ota\(\)/);assert.match(source,/window\.openAir6Ota=/);assert.match(source,/ota\.current_version/);assert.match(source,/if\(prompt&&hasNew/);assert.match(source,/renderOta\(ota,activePageId==='settings'\)/);assert.match(source,/otaTabBadge\.id='air6OtaTabBadge';otaTabBadge\.textContent='1'/);assert.match(source,/setOtaBadge\(active&&hasNew\)/);assert.match(source,/firmwareBadge\.textContent='新'/);assert.match(source,/querySelector\('\.row-title'\)\?\.appendChild\(firmwareBadge\)/);
  assert.doesNotMatch(source,/badge\.textContent='有新版本'/);
  assert.match(source,/id="air6OtaKeep" type="checkbox" checked/);assert.match(source,/otaSend\('upgrade',\{keep,sha256,rollback\}\)/);
  const activeBranch=source.slice(source.indexOf('window.openFirmwareModal='),source.indexOf("const panel=document.createElement"));assert.match(activeBranch,/if\(active\)return;/);
});
test('OTA availability controls the card and badges through status changes without starting an update',()=>{
 let shown=null;const nodes=new Map();const element=()=>{const classes=new Set();return {textContent:'',value:'',disabled:false,style:{},children:[],appendChild(n){this.children.push(n);},classList:{contains:c=>classes.has(c),add:c=>classes.add(c),remove:c=>classes.delete(c),toggle(c){if(classes.has(c)){classes.delete(c);return false;}classes.add(c);return true;}}};};
 const el=id=>{if(!nodes.has(id))nodes.set(id,element());return nodes.get(id);};
 const c=load(['otaSize','otaHasNew','renderOta'],{otaEntry:element(),otaError:'',otaCheckedAt:0,otaRequestKind:'',send(){},active:true,otaState:{},otaBusy:false,otaPrompted:'',otaOverlay:element(),el,setOtaBadge:value=>shown=value,_mAdd(){throw Error('badge probe must not open OTA outside My page');},otaSend(){}});
 const check=(data,visible)=>{c.renderOta(data,false);assert.equal(shown,visible);assert.equal(c.otaEntry.style.display,visible?'flex':'none');};
 check({},false);
 check({supported:true,phase:'current',current_version:'1.1',latest_version:'1.1'},false);
 check({supported:true,phase:'available',current_version:'1.0',latest_version:'1.1',sha256:'a'.repeat(64)},true);
 check({supported:true,phase:'current',current_version:'1.1',latest_version:'1.1'},false);
 check({supported:false,current_version:'1.0',latest_version:'1.1'},false);
 c.active=false;check({supported:true,current_version:'1.0',latest_version:'1.1'},false);
});
test('OTA status received on the My page requests the one-time update prompt',()=>{
 let prompt=null,data=null;const c=load(['air6OtaData'],{active:true,otaBusy:true,otaRequestKind:'status',otaError:'',activePageId:'settings',renderOta:(value,show)=>{data=value;prompt=show;},showUpdateToast(){},otaClose(){}});
 c.air6OtaData({ok:true,kind:'status',data:{current_version:'1.0',latest_version:'1.1'}});assert.equal(prompt,true);assert.equal(data.latest_version,'1.1');assert.equal(c.otaBusy,false);
});
function load(names,context){context.window=context;vm.createContext(context);for(const name of names)vm.runInContext(definitions.get(name),context);return context;}

function cellView(){
 const nodes=new Map();function element(){return {textContent:'',value:'',children:[],dataset:{},style:{},disabled:false,appendChild(n){this.children.push(n);},querySelectorAll(){return this.children.flatMap(n=>[...(n.dataset?.cellLine?[n]:[]),...n.querySelectorAll()]);}};}
 const el=id=>{if(!nodes.has(id))nodes.set(id,element());return nodes.get(id);};
 const c=load(['draftCellLines','deviceCellLines','cellLineLabel','syncCellActions','renderDeviceCells','cellQuality','renderLockCells','renderCellDraft'],{el,document:{createElement:element},busy:false,loaded:true,addCellDraft(){},run(){},saveCellDraft(){}});return {c,el};
}

test('lock rows include serving labels, all signal fields and missing-value text with compact actions',()=>{
 const {c,el}=cellView();c.renderLockCells([{rat:'nr',band:'N41',pci:'581',earfcn:'504990',isServing:true,rsrp:'-86',rsrq:'-11',sinr:'0'},{rat:'nr',band:'N41',pci:'520',earfcn:'504990',rsrp:'--',rsrq:'--',sinr:'--'}]);
 const text=n=>[n.textContent,...n.children.map(text)].join(' '),rendered=text(el('air6LockNeighbors'));assert.match(rendered,/服务小区/);assert.match(rendered,/邻区 1/);assert.match(rendered,/-86 dBm/);assert.match(rendered,/-11 dB/);assert.match(rendered,/0 dB/);assert.match(rendered,/未上报/);assert.match(rendered,/一般/);
 el('air6Cells').value='NR,504990,520';c.syncCellActions();const adds=el('air6LockNeighbors').querySelectorAll();assert.equal(adds[1].textContent,'已添加');assert.equal(adds[1].disabled,true);assert.equal(el('air6CellsSave').disabled,false);
 el('air6Cells').value='';c.syncCellActions();assert.equal(el('air6CellsSave').disabled,true);assert.equal(adds[1].textContent,'添加');
});

test('device lock list is shown separately and does not replace a local multi-cell draft',()=>{
 const {c,el}=cellView();el('air6Cells').value='NR,504990,520';c.renderDeviceCells({lte_cell_list:[],nr_cell_list:[{nr_arfcn:504990,pci:581}]});assert.equal(el('air6Cells').value,'NR,504990,520');assert.match(el('air6DeviceCellRows').children[0].textContent,/PCI 581/);assert.match(el('air6DeviceCellSummary').textContent,/1 个/);c.renderCellDraft();assert.match(el('air6CellDraftCount').textContent,/待提交 1/);assert.match(el('air6CellDraftRows').children[0].children[0].textContent,/PCI 520/);
});
test('marking an open conversation read never closes it or unlocks another SMS write',()=>{
  let closed=0,refreshed=0,persisted=0;const msg={Index:'r4',Isopened:'0'},chat={recv:[msg],unread:1};
  const c=load(['air6SmsResult'],{active:true,smsWriting:'smsSend',smsChat:chat,smsDetailsAcc:{recv:[msg]},smsConversations:{convs:[chat]},updateSmsBadge(){},smsPersistCache(){persisted++;},showUpdateToast(){},closeSmsChat(){closed++;},smsLoadList(){refreshed++;}});
  c.air6SmsResult({type:'read',ok:true,recv:[{Index:'r4'}]});
  assert.equal(msg.Isopened,'1');assert.equal(chat.unread,0);assert.equal(c.smsWriting,'smsSend');assert.equal(closed,0);assert.equal(refreshed,0);assert.equal(persisted,1);
  c.air6SmsResult({type:'read',ok:false,recv:[{Index:'r4'}],readStates:{r4:'0'},message:'failed'});assert.equal(msg.Isopened,'0');assert.equal(chat.unread,1);assert.equal(closed,0);
});
test('stale Wi-Fi or control replies cannot overwrite a newer modal or release its busy state',()=>{
  const c=load(['accepts','air6WifiData','air6ControlData'],{active:true,currentRequestId:'new',panel:{classList:{contains:()=>true}},loaded:false,busy:true});
  c.air6WifiData({requestId:'old',ok:true,networks:[]});c.air6ControlData({requestId:'older',bands:{}});
  c.air6ControlData({bands:{}});assert.equal(c.loaded,false);assert.equal(c.busy,true);
});
test('opening another panel during a slow read starts a new correlated request',()=>{
  const sent=[],classes=new Set(),nodes=new Map(),el=id=>{if(!nodes.has(id))nodes.set(id,{textContent:'',style:{}});return nodes.get(id);};
  const panel={classList:{add:v=>classes.add(v),remove:v=>classes.delete(v),contains:v=>classes.has(v)},querySelectorAll:()=>[],querySelector:()=>({scrollTop:0})};
  const c=load(['readAction','dispatchPanel','setBusy','open','close'],{active:true,busy:false,dirty:false,loaded:false,currentSection:'rat',controlState:null,requestSequence:0,currentRequestId:'',panel,el,_mAdd(){},_mDel(){},clearPanelSecrets(){},syncCellActions(){},send:(action,data)=>sent.push({action,...data})});
  c.open('wifi');assert.equal(c.busy,true);c.close();c.open('band');
  assert.deepEqual(sent.map(v=>v.action),['air6WifiLoad','air6ReadControls']);assert.notEqual(sent[0].requestId,sent[1].requestId);assert.equal(c.currentRequestId,sent[1].requestId);
});
test('releasing modal busy state does not enable a password unsupported by its security mode',()=>{
  const unsupported={id:'password',dataset:{permanentDisabled:'1'},disabled:true},ordinary={id:'ssid',dataset:{},disabled:true};
  const c=load(['setBusy'],{busy:true,loaded:true,syncCellActions(){},panel:{querySelectorAll:()=>[unsupported,ordinary]}});
  c.setBusy(false);assert.equal(unsupported.disabled,true);assert.equal(ordinary.disabled,false);
});

test('clearing the multi-cell list changes only the persisted draft and never dispatches an unlock',()=>{
 const nodes={air6Cells:{value:'NR,504990,581'},air6Result:{textContent:''}};let saved=0,sent=0;
 const c=load(['clearCellDraft'],{el:id=>nodes[id],saveCellDraft(){saved++;},send(){sent++;}});c.clearCellDraft();assert.equal(nodes.air6Cells.value,'');assert.equal(saved,1);assert.equal(sent,0);assert.match(nodes.air6Result.textContent,/设备锁定保持/);
});

test('closing settings removes password input values and the SMTP comparison baseline',()=>{
 const input={value:'TEST_SECRET'},c=load(['clearPanelSecrets'],{smsConfigBaseline:{email_smtp_password:'TEST_SECRET'},wifiEditors:new Map(),panel:{querySelectorAll:()=>[input]}});c.clearPanelSecrets();assert.equal(input.value,'');assert.equal(Object.keys(c.smsConfigBaseline).length,0);
});

test('automatic control summaries update rows during an open dialog without changing edits or unlocking it',()=>{
 const nodes=new Map(),el=id=>{if(!nodes.has(id))nodes.set(id,{textContent:'待读取',value:'EDIT'});return nodes.get(id);};
 const c=load(['splitBands','ratLabels','ratSummary','air6ControlSummary','refreshNetSettingText'],{active:true,controlSummaryState:null,controlState:null,busy:true,dirty:true,el});
 c.air6ControlSummary({loading:true});assert.equal(el('lockedBandText').textContent,'读取中…');
 c.air6ControlSummary({bands:{current_lte_band:'1',support_lte_band:'1/3',current_nr_band:'41',support_nr_band:'41'},rat:'21',single:{lock_mode:0},errors:{multiple:'failed'}});
 assert.equal(el('lockedBandText').textContent,'已限制频段');assert.equal(el('lockedCellText').textContent,'读取失败');assert.equal(el('netSettingText').textContent,'自动');
 c.refreshNetSettingText();assert.equal(el('netSettingText').textContent,'自动');assert.equal(c.busy,true);assert.equal(c.dirty,true);assert.equal(c.controlState,null);assert.equal(el('air6Arfcn').value,'EDIT');
 c.air6ControlSummary({single:{lock_mode:0},multiple:{lte_cell_count:0,nr_cell_count:2},errors:{}});assert.equal(el('lockedCellText').textContent,'多小区锁定');
});


test('saving one Wi-Fi preserves edits to other radios and clears only the saved password',()=>{
 const editor=(ssid,password)=>({network:{ssid,band:'5G'},title:{textContent:ssid},ssid:{value:ssid},password:{value:password},enabled:{checked:true},hidden:{checked:false}});
 const first=editor('EDIT_ONE','PASSWORD_ONE'),second=editor('EDIT_TWO','PASSWORD_TWO'),nodes={air6Result:{}};
 const c=load(['air6WifiResult'],{active:true,accepts:()=>true,wifiEditors:new Map([['ap0',first],['ap1',second]]),el:id=>nodes[id],setBusy(){},showUpdateToast(){},dispatchPanel(){throw Error('must not reload every radio');}});
 c.air6WifiResult({ok:true,section:'ap0',networks:[{section:'ap0',ssid:'SAVED_ONE',band:'5G',enabled:false,hidden:true}],message:'saved'});
 assert.equal(first.ssid.value,'SAVED_ONE');assert.equal(first.password.value,'');assert.equal(first.enabled.checked,false);assert.equal(second.ssid.value,'EDIT_TWO');assert.equal(second.password.value,'PASSWORD_TWO');
});

test('Wi-Fi refresh failure keeps editable drafts and draft snapshots contain only changed fields',()=>{
 const editor={network:{ssid:'OLD',enabled:true,hidden:false},ssid:{value:'EDIT'},password:{value:'NEW_PASS'},enabled:{checked:true},hidden:{checked:true}};
 const box={textContent:'existing form'},nodes={air6WifiNetworks:box,air6Result:{}},c=load(['wifiDrafts','air6WifiData'],{active:true,accepts:()=>true,loaded:false,wifiEditors:new Map([['ap',editor]]),el:id=>nodes[id],setBusy(){}});
 c.air6WifiData({ok:false,message:'offline'});assert.equal(box.textContent,'existing form');assert.equal(c.loaded,true);assert.deepEqual(JSON.parse(JSON.stringify(c.wifiDrafts().get('ap'))),{ssid:'EDIT',hidden:true,password:'NEW_PASS'});
});

test('SMS send keeps the conversation open and preserves text typed while waiting',()=>{
 const nodes={smsChatInput:{value:'NEXT MESSAGE'},smsListActions:{style:{}}};let closed=0,refreshed=0;
 const c=load(['air6SmsResult'],{active:true,smsWriting:'smsSend',pendingSmsSend:{source:'chat',number:'10086',text:'SENT MESSAGE'},smsChat:{number:'10086'},el:id=>nodes[id],showUpdateToast(){},closeSmsChat(){closed++;},closeSmsCompose(){closed++;},smsLoadList(){refreshed++;},smsListEdit:false,smsSelected:{},smsLoadedAt:1,smsDiffing:false});
 c.air6SmsResult({type:'send',ok:true,message:'sent'});assert.equal(nodes.smsChatInput.value,'NEXT MESSAGE');assert.equal(closed,0);assert.equal(refreshed,1);
 c.pendingSmsSend={source:'chat',number:'10086',text:'NEXT MESSAGE'};c.air6SmsResult({type:'send',ok:false,message:'failed'});assert.equal(nodes.smsChatInput.value,'NEXT MESSAGE');
 c.pendingSmsSend={source:'chat',number:'10086',text:'NEXT MESSAGE'};c.air6SmsResult({type:'send',ok:true,message:'sent'});assert.equal(nodes.smsChatInput.value,'');assert.equal(closed,0);
});

test('SMS list refresh updates the open chat without reopening or replacing its draft input',()=>{
 let rendered=0;const current={number:'10086',send:[]},updated={number:'10086',send:[{Msg:'sent'}]};const c=load(['smsBuildConversations'],{active:true,smsChat:current,smsConversations:{convs:[updated]},el:()=>null,buildSmsConversations(){},renderSmsChat(){rendered++;}});c.smsBuildConversations();assert.equal(c.smsChat,updated);assert.equal(rendered,1);
});

test('Android Back calls Air6 close cleanup instead of only removing its CSS class',()=>{
 const kotlin=fs.readFileSync(require('node:path').resolve(__dirname,'../app/src/main/java/com/fhcpeboard/android/MainActivity.kt'),'utf8');
 assert.match(kotlin,/window\.lanHandleBack/);assert.doesNotMatch(kotlin,/classList\.remove\('active'\).*air6Control/);
});


test('advanced automatic summaries show current modes without touching open editor values',()=>{
 const nodes=new Map(),el=id=>{if(!nodes.has(id))nodes.set(id,{textContent:'点击查看',value:'UNSAVED',style:{}});return nodes.get(id);};
 const c=load(['splitBands','ratLabels','ratSummary','air6ControlSummary'],{active:true,controlSummaryState:null,el,busy:true,dirty:true,currentRequestId:'open-editor'});
 c.air6ControlSummary({loading:true});assert.equal(el('air6AdvancedStatus_usb').textContent,'读取中…');
 c.air6ControlSummary({cfun:{mode:0},usb:{supported:true,mode:'ep',current_mode:'rc'},imei:{imei:'123456789012345'},errors:{}});
 assert.equal(el('air6AdvancedStatus_cfun').textContent,'飞行模式');assert.equal(el('air6AdvancedStatus_usb').textContent,'RC 主机 · 待重启');assert.equal(el('air6AdvancedStatus_imei').textContent,'1234…2345');assert.equal(el('air6Imei').value,'UNSAVED');assert.equal(c.busy,true);assert.equal(c.dirty,true);
 c.air6ControlSummary({usb:{supported:false},errors:{cfun:'failed'}});assert.equal(el('air6AdvancedRow_usb').style.display,'none');assert.equal(el('air6AdvancedStatus_cfun').textContent,'读取失败');
});
test('Air6 moves Theme below Board Log and defaults new installs to rainbow only',()=>{
 assert.match(source,/insertBefore\(cardStyleRow,boardLogRow\.nextSibling\)/);
 assert.match(source,/cardStyleParent\.insertBefore\(cardStyleRow,cardStyleNext/);
 assert.match(source,/if\(active&&!homeCardsConfigured\)applyHomeCards\(\{header:'pro'\}\)/);
 assert.match(source,/applyHomeCards\(\{header:active\?'pro':'basic'\}\)/);
 assert.match(source,/if\(hasHeader\)homeCardsConfigured=true/);
});

test('LG6851F uses its own imported device image and normalizes the legacy model label',()=>{
 const imageSource=fs.readFileSync(require('node:path').join(__dirname,'../app/src/main/assets/lg6851f_image.js'),'utf8');
 const imageContext={window:{__DEV_IMG__:{}}};vm.createContext(imageContext);vm.runInContext(imageSource,imageContext);
 assert.match(imageContext.window.__DEV_IMG__.lg6851f,/^data:image\/webp;base64,/);
 const page=fs.readFileSync(require('node:path').join(__dirname,'../app/src/main/assets/fhcpeweb.html'),'utf8');
 const adapter=fs.readFileSync(require('node:path').join(__dirname,'../app/src/main/assets/lan_ui.js'),'utf8');
 const runtime=fs.readFileSync(require('node:path').join(__dirname,'../app/src/main/assets/lan_runtime.js'),'utf8');
 assert.doesNotMatch(page,/LG6851M/);
 assert.match(adapter,/LG6851M\$\/i\.test\(String\(data\.deviceModel\|\|''\)\)\)data=Object\.assign\(\{\},data,\{deviceModel:'LG6851F'\}\)/);
 assert.match(runtime,/lg6851fImage=N\.assetRead\('lg6851f_image\.js'\)/);
 assert.match(runtime,/images\+lg6851fImage/);
});


test('refreshing SMS settings retains changed fields but updates untouched values and the server baseline',()=>{
 const nodes={air6SmsCfg_email_subject:{value:'MY EDIT'},air6SmsCfg_email_enable:{checked:false},air6Result:{}},c=load(['air6ExtraData'],{active:true,accepts:()=>true,loaded:true,setBusy(){},currentPanelAction:'air6ExtraRead',smsConfigBaseline:{email_subject:'OLD',email_enable:false},smsConfigFields:[['email_subject','Subject','text'],['email_enable','Email','checkbox']],el:id=>nodes[id],syncSmsConfigFields(){}});
 c.air6ExtraData({ok:true,kind:'smsconfig',config:{email_subject:'SERVER',email_enable:'true'}});assert.equal(nodes.air6SmsCfg_email_subject.value,'MY EDIT');assert.equal(nodes.air6SmsCfg_email_enable.checked,true);assert.equal(c.smsConfigBaseline.email_subject,'SERVER');
 c.currentPanelAction='air6ExtraSave';c.air6ExtraData({ok:true,kind:'smsconfig',config:{email_subject:'MY EDIT',email_enable:true}});assert.equal(c.smsConfigBaseline.email_subject,'MY EDIT');
});

test('Wi-Fi save without changes or with an invalid password neither confirms nor dispatches',()=>{
 const elements=[];function element(){const n={textContent:'',value:'',checked:false,style:{},dataset:{},children:[],appendChild(c){this.children.push(c);},prepend(){},querySelectorAll(){return [];}};elements.push(n);return n;}
 const nodes={air6WifiNetworks:element(),air6Result:element()};let confirms=0,runs=0;
 const c=load(['wifiDrafts','air6WifiData'],{active:true,accepts:()=>true,loaded:false,wifiEditors:new Map(),el:id=>nodes[id],setBusy(){},showUpdateToast(){},document:{createElement:element,createTextNode:t=>({textContent:t})},confirm(){confirms++;return true;},run(){runs++;}});
 c.air6WifiData({ok:true,networks:[{section:'ap0',band:'5G',ssid:'HOME',enabled:true,hidden:false,encryption:'sae-mixed',canSetPassword:true}]});
 const card=nodes.air6WifiNetworks.children[0],save=card.children.at(-1),inputs=card.children.filter(n=>n.children?.length).map(n=>n.children[0]),password=inputs[1];
 save.onclick();assert.equal(confirms,0);assert.equal(runs,0);assert.match(nodes.air6Result.textContent,/没有需要保存/);
 password.value='short';save.onclick();assert.equal(confirms,0);assert.equal(runs,0);assert.match(nodes.air6Result.textContent,/8–63/);
 password.value='longenough';save.onclick();assert.equal(confirms,1);assert.equal(runs,1);
});

test('plain theme puts DL/UL bandwidth in the carrier header opposite the band label',()=>{
 function element(){return {className:'',textContent:'',style:{},children:[],appendChild(n){this.children.push(n);n.parentNode=this;}};}
 const nodes={caCarriersList:element(),ca:element()};
 const c=load(['renderAir6Ca'],{renderAir6Signal(){},active:true,el:id=>nodes[id],document:{body:{classList:{contains:()=>false}},createElement:element},getRsrpColor:()=>'',getSinrColor:()=>'',getRsrqColor:()=>''});
 c._lastCaCarriers=[{type:'PCC',band:'N41',dlBandwidth:'100MHz',ulBandwidth:'100MHz',pci:'581',arfcn:'504990'},{type:'SCC',band:'N28',dlBandwidth:'30MHz',ulBandwidth:'未配置',pci:'556',arfcn:'152650'}];c._lastCaSummary='2CC';
 c.renderAir6Ca();
 const cards=nodes.caCarriersList.children;assert.equal(cards.length,2);
 for(const [card,band,dl,ul] of [[cards[0],'N41','DL 100MHz','UL 100MHz'],[cards[1],'N28','DL 30MHz','UL 未配置']]){
  const head=card.children[0];assert.equal(head.className,'air6-plain-carrier-head');
  assert.deepEqual(head.children.map(n=>n.className),[head.children[0].className,'carrier-tag','air6-plain-bandwidth']);
  assert.equal(head.children[1].textContent,band);assert.deepEqual(head.children[2].children.map(n=>n.textContent),[dl,ul]);
  assert.ok(!card.children.slice(1).some(n=>n.className==='air6-plain-bandwidth'),'no separate bandwidth row');
 }
});

test('OTA version badge compares latest epoch instead of the selected rollback image',()=>{
 const c=load(['otaHasNew'],{});
 assert.equal(c.otaHasNew({current_version:'V2',latest_version:'V2',version:'V1',is_downgrade:true}),false);
 assert.equal(c.otaHasNew({current_version:'custom',current_epoch:20,latest_version:'older',latest_sha256:'a',releases:[{sha256:'a',build_epoch:10}]}),false);
 assert.equal(c.otaHasNew({current_version:'V2',current_epoch:20,latest_version:'V3',latest_sha256:'a',releases:[{sha256:'a',build_epoch:30}]}),true);
});
test('background OTA status cannot erase a pending manual check or its failure',()=>{
 const c=load(['air6OtaData'],{active:true,otaBusy:true,otaRequestKind:'check',otaError:'',otaState:{},activePageId:'overview',renderOta(){},otaClose(){},showUpdateToast(){}});
 c.air6OtaData({ok:true,kind:'status',data:{phase:'current'}});assert.equal(c.otaBusy,true);
 c.air6OtaData({ok:false,kind:'check',message:'network unavailable'});assert.equal(c.otaBusy,false);assert.equal(c.otaError,'network unavailable');
 c.air6OtaData({ok:true,kind:'status',data:{phase:'current'}});assert.equal(c.otaError,'network unavailable');
});

test('colorful signal gauges use overview values, including zero, instead of carrier values',()=>{
 const grid={children:[],appendChild(n){this.children.push(n);}};
 const createElement=()=>{const nodes={'.gnum':{style:{}},'.metric-label':{}};return {querySelector:key=>nodes[key],nodes};};
 const c=load(['renderAir6Signal'],{active:true,overviewSignal:{rsrp:'-80',sinr:'0',rsrq:'-11',rssi:'-71'},el:()=>grid,document:{body:{classList:{contains:()=>true}},createElement},_gaugeColor:()=> '#00ff00',_gaugePct:()=>.5});c._lastCaCarriers=[{rsrp:'-95',sinr:'20',rsrq:'-29',rssi:'-50'}];c.renderAir6Signal();assert.deepEqual(grid.children.map(n=>n.nodes['.gnum'].textContent),['-80','0','-11','-71']);
});

test('global refresh preserves a focused dynamic Wi-Fi editor and dirty drafts',()=>{
 let reads=0;const input={tagName:'INPUT'},panel={contains:n=>n===input,classList:{contains:()=>true}};
 const c=load(['air6RefreshOpenPanel'],{globalSnapshot:{},document:{activeElement:input},panel,active:true,busy:false,dirty:false,otaConfirm:{classList:{contains:()=>false}},currentSection:'wifi',readAction:()=> 'air6WifiLoad',setBusy(){},dispatchPanel(){reads++;}});
 c.air6RefreshOpenPanel();assert.equal(reads,0);c.document.activeElement=null;c.dirty=true;c.air6RefreshOpenPanel();assert.equal(reads,0);c.dirty=false;c.air6RefreshOpenPanel();assert.equal(reads,1);
});

test('Air6 traffic uses decimal GB like Web, not binary GiB labeled as GB',()=>{
 const c=load(['bytes'],{});assert.equal(c.bytes(16690000000),'16.69 GB');assert.equal(c.bytes(1000000),'1.00 MB');assert.equal(c.bytes(1000),'1.00 KB');assert.equal(c.bytes(null),'--');assert.equal(c.bytes(-1),'--');
});
