/* Complete upstream page; strip cloud-only surfaces without recreating UI. */
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const html=require('parse5'),acorn=require('acorn'),walk=require('acorn-walk'),{generate}=require('astring');
const source=fs.readFileSync(path.join(__dirname,'.upstream-cache/upstream.html'),'utf8');
const removed=new Set(('maskToken getAcToken getAcAccount toggleAcEye applyMaskFocus initAcMaskInputs updateAcEyeBtn doAcFieldBtn onAcFieldBtn refreshTokenStatus renderDeviceLoading renderDeviceList selectDevice openLoginLineModal closeLoginLineModal selectLineMode openAccountConfigModal closeAccountConfigModal switchAcMode saveAccountConfig openActivateModal closeActivateModal copyActivateId setAcActivateStatus submitActivateCode updateAcSaveBtn setAcSaveState renderRemoteSwitchList _askDevOps openDevSwitchModal _refreshDeviceRowIfVisible openRenameModal closeRenameModal saveRename').split(' '));
const callbacks=new Set(('selectDeviceDone selectDeviceRejected updateTokenStatusCard accountConfigResult showActivateSection activateResult lineConfigResult lineModeSaved setLineBadge renderAcBadge setAcLocalState acVerifyingGuard localAccountsSaved localTestResult _pickRemoteDev renameResult').split(' '));
const removeIds=new Set(['accountConfigModal','acActivateModal','loginLineModal','renameModalOverlay']);
const counts={removedFunctions:[],removedCallbacks:[],removedDom:[]};
function script(text){
  const ast=acorn.parse(text,{ecmaVersion:'latest'});
  // Refresh an already rendered inbox in place. Showing the five-row skeleton
  // above old messages changes layout until the device response arrives.
  walk.simple(ast,{FunctionDeclaration(fn){
    if(fn.id?.name==='smsEnterSms')fn.body.body.unshift(...acorn.parse(`
      if(!smsForceFresh && smsConversations && smsConversations.convs.length){
        if(smsCacheLoadLock || smsListInflight || smsLoadingMore)return;
        smsDiffing=true;smsListInflight=true;smsHideLoading();
        sendToScriptable('smsList');return;
      }
    `,{ecmaVersion:'latest',allowReturnOutsideFunction:true}).body);
    if(fn.id?.name==='smsShowSkeleton')fn.body.body.unshift(...acorn.parse(`
      const existingList=document.getElementById('smsListContainer');
      if(existingList && existingList.querySelector('.sms-row')){smsHideLoading();return;}
    `,{ecmaVersion:'latest',allowReturnOutsideFunction:true}).body);
  }});
  walk.simple(ast,{FunctionDeclaration(fn){if(fn.id?.name==='openRenameModal')fn.body.body=fn.body.body.filter(stmt=>!(stmt.type==='IfStatement'&&generate(stmt).includes('_lineBadgeText')));}});
  ast.body=ast.body.filter(n=>{if(n.type==='FunctionDeclaration'&&removed.has(n.id.name)){counts.removedFunctions.push(n.id.name);return false;}return true;});
  walk.simple(ast,{AssignmentExpression(n){
    const name=n.left.type==='MemberExpression'&&(n.left.property.name||n.left.property.value);
    if(callbacks.has(name)){counts.removedCallbacks.push(name);Object.keys(n).forEach(k=>delete n[k]);Object.assign(n,{type:'Literal',value:0,raw:'0'});}
  }});
  walk.simple(ast,{Identifier(n){if(removed.has(n.name))n.name=['openAccountConfigModal','openLoginLineModal'].includes(n.name)?'lanShowLogin':'lanNoop';}});
  return 'function lanNoop(){}\n'+generate(ast);
}
const tree=html.parse(source);
function containsId(node,id){return node.attrs?.some(a=>a.name==='id'&&a.value===id)||(node.childNodes||[]).some(n=>containsId(n,id));}
function makeDeviceNameReadonly(node){
  if(node.attrs){
    const cls=node.attrs.find(a=>a.name==='class');
    if(cls)cls.value=cls.value.split(/\s+/).filter(x=>x!=='clickable').join(' ');
    node.attrs=node.attrs.filter(a=>!a.name.startsWith('on'));
  }
  if(node.childNodes)node.childNodes=node.childNodes.filter(child=>{
    const isChevron=child.tagName==='svg'&&child.attrs?.some(a=>a.name==='class'&&a.value.split(/\s+/).includes('chevron'));
    return !isChevron;
  });
}
function clean(node){
  if(node.childNodes)node.childNodes=node.childNodes.filter(n=>{
    const id=n.attrs?.find(a=>a.name==='id')?.value;
    const hasRename=n.attrs?.some(a=>a.name==='class'&&a.value.split(/\s+/).includes('ios-row'))&&containsId(n,'setDeviceName');
    if(removeIds.has(id)){counts.removedDom.push(id||'cloudRow');return false;}
    if(hasRename)makeDeviceNameReadonly(n);
    return true;
  });
  if(node.tagName==='script'&&node.childNodes?.length){const value=node.childNodes.map(n=>n.value||'').join('');if(value.trim())node.childNodes=[{nodeName:'#text',value:script(value),parentNode:node}];}
  if(node.tagName==='style'&&node.childNodes?.length)for(const child of node.childNodes)if(child.value)child.value=child.value.replace(/#accountConfigModal(?= \.ac-(?:btn-primary|field-group))/g,'#localLoginModal').replace(/([^{}]+)\{([^{}]*)\}/g,(full,selectors,body)=>{const keep=selectors.split(',').filter(s=>!/#(?:accountConfigModal|acActivateModal|loginLineModal|acAccountEye|acTokenEye)/.test(s));return keep.length?keep.join(',')+'{'+body+'}':'';});
  if(node.attrs)for(const a of node.attrs)if(a.name.startsWith('on')){
    a.value=a.value.replace(/openLoginLineModal|openAccountConfigModal/g,'lanShowLogin');
    for(const name of removed)a.value=a.value.replace(new RegExp('\\b'+name+'\\b','g'),'lanNoop');
  }
  for(const child of node.childNodes||[])clean(child);
}
clean(tree);
const output=html.serialize(tree).replace(/改完同时写入设备和云端/g,'仅修改 APP 显示名称').replace(/设备改名仅远程线路支持/g,'设备改名需要先登录局域网设备').replace(/设备已改名，云端同步失败/g,'设备已改名').replace(/看板服务远程重启/g,'本地连接刷新').replace(/远程服务正在恢复/g,'设备连接正在恢复').replace(/远程服务即将重启/g,'设备即将重启').replace(/远程服务/g,'设备连接').replace(/账号中心/g,'本地账号').replace(/账号未配置/g,'本地未配置');
if(/activateWithCode|submitActivateCode|激活码/.test(output))throw Error('Cloud execution/content remains in page');
const adapted=output.replace(/function renderCells\(e\) \{[\s\S]*?\n\}/,source=>source
  .replace('renderCells(e)', 'renderCells(e, cells = rawAllCellsData)')
  .replace('rawAllCellsData.forEach','cells.forEach')
  .replace('const t = normalizeBand(', 'const t = e.displayBand ?? normalizeBand(')
  .replace('const n = 0 === e.carrierIndex','const n = e.primary ?? (0 === e.carrierIndex)')
  .replace('主载波</div><div class="cell-sub-line">PCI','${e.cellTitle || "主载波"}</div><div class="cell-sub-line">PCI')
  .replaceAll(' | EARFCN ${e.earfcn',' | ${e.channelLabel || "EARFCN"} ${e.earfcn')
  .replace(' | ${i} | ${s}','${e.cellDetails ?? (" | " + i + " | " + s)}')
  .replaceAll('${safeVal(e.sinr, "dB")}','${e.sinr === "0" && e.displayBand !== undefined ? "0 dB" : safeVal(e.sinr, "dB")}'));
fs.writeFileSync(path.resolve(__dirname,'../app/src/main/assets/fhcpeweb.html'),adapted);
fs.writeFileSync(path.resolve(__dirname,'../docs/upstream-ui-manifest.json'),JSON.stringify({sourceSha256:crypto.createHash('sha256').update(source).digest('hex'),artifactSha256:crypto.createHash('sha256').update(adapted).digest('hex'),...counts},null,2)+'\n');
console.log('Imported upstream page; removed cloud/activation and rename controls.');
