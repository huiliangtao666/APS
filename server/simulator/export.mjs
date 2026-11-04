import {VERSION, requireThat as need, fingerprint, copy, minute, gapDescriptions} from './contract.mjs';

const excelTables=['每日需求','期初库存','既有采购在途','期初在制','在制剩余映射','停机安排','生产班次','日业务时点规则'];
const csvTables=['simulationEvents','executionSources','executionFacts','executionMaterials','supplies','supplyDelays','inventory','orders','calendars','resourceStops','downtime'];
export const TIME_BASES={excel:'2026-10-31T00:00:00+08:00',csv:'2026-11-02T08:00:00+08:00'};
export function timeCompatibility(time,target) {
  need(Object.hasOwn(TIME_BASES,target),'TARGET_MODEL','target','选择Excel或CSV模型');
  const offset=minute(time)-minute(TIME_BASES[target]);
  return {time,target,origin:TIME_BASES[target],offsetMinutes:offset,unit:'分钟',
    status:offset<0?'NEEDS_ADAPTATION':'REQUIRES_NATIVE_VALIDATION',gap:offset<0?'G02':null};
}
export function catalog(workbookSchema,csvDefs) {
  need(workbookSchema?.tables&&Array.isArray(csvDefs),'NATIVE_SCHEMA_REQUIRED','catalog','须注入当前真实schema/CSV defs，不维护另一份权威字段');
  const tables=[];
  for(const table of excelTables) {
    const s=workbookSchema.tables[table];need(s?.fields,'NATIVE_SCHEMA_MISSING',table,'当前版本缺少字段合同');
    tables.push({model:'excel',table,key:s.key,fields:s.fields.map(f=>f.name),status:'HEADER_ONLY'});
  }
  for(const table of csvTables) {
    const s=csvDefs.find(d=>d.key===table);need(s?.fields,'NATIVE_SCHEMA_MISSING',table,'当前版本缺少CSV定义');
    tables.push({model:'csv',table,filename:s.file,fields:copy(s.fields),status:'HEADER_ONLY'});
  }
  return {schema:VERSION,schemaVersion:workbookSchema.version,tables,meaning:'表头来自当前接口；字段存在不代表完整日批可导入'};
}
export function csv(headers,rows) {
  const cell=v=>{let s=v==null?'':typeof v==='object'?JSON.stringify(v):String(v);
    // Spreadsheet formula execution is prevented; identifiers and business values remain in the JSON archive.
    if(/^[=+@-]/.test(s)&&typeof v!=='number')s="'"+s;
    return '"'+s.replaceAll('"','""')+'"';};
  return '\uFEFF'+[headers.map(cell).join(','),...rows.map(r=>headers.map(h=>cell(r[h])).join(','))].join('\r\n')+'\r\n';
}
export function tableTemplate(nativeCatalog,model,table) {
  const entry=nativeCatalog.tables.find(t=>t.model===model&&t.table===table);
  need(entry,'TABLE_UNSUPPORTED','table','此表不属于本模块声明的兼容检查范围');
  return {filename:entry.filename??table+'.csv',content:csv(entry.fields,[]),status:'HEADER_ONLY'};
}
export function cumulativeMaterials(spec,snap) {
  const rows=[],gaps=[];
  for(const t of snap.tasks) {
    for(const [lotId,quantity] of Object.entries(t.consumed)) {
      const lot=snap.lots.find(l=>l.id===lotId),m=spec.materials.find(m=>m.id===lot?.materialId),factId=t.csvMapping?.factId;
      if(!factId||!lot||!m){gaps.push({gap:'G01',taskId:t.id,lotId,reason:'缺显式CSV事实身份/批次物料映射'});continue;}
      rows.push({'记录编号':factId+'-'+lotId,'事实编号':factId,'批次编号':lotId,'物料编号':lot.materialId,'累计已用数量':quantity,'单位':m.unit});
    }
  }
  return {rows,gaps,status:'CUMULATIVE_CANDIDATE_NOT_SUBMITTED'};
}
export function inventoryEquivalence({after,consumed,proof}) {
  need(Number.isFinite(after)&&after>=0&&Number.isFinite(consumed)&&consumed>=0,'INVENTORY_QUANTITY','quantity','须明确非负扣后余额和累计耗料');
  const complete=proof?.sameLot===true&&proof.sameLineage===true&&proof.sameCumulativeScope===true&&proof.allReceiptsAndIssuesAccounted===true&&
    typeof proof.baselineHash==='string'&&/^[a-f0-9]{64}$/.test(proof.baselineHash);
  return {after,consumed,beforeEquivalent:complete?after+consumed:null,status:complete?'ARITHMETIC_ONLY':'NEEDS_ADAPTATION',
    gap:'G05',meaning:'等价算术不能替代真实目标批次、占用、收发、谱系及历史对账'};
}
export function exportPackage(d,nativeCatalog) {
  const snap=d.checkpoints.at(-1)?.snapshot;
  need(snap,'NO_CHECKPOINT','checkpoint','先保存完整成功日结');
  const materials=cumulativeMaterials(d.spec,snap);
  const report={stage:'A',mode:'INDEPENDENT',deliveryState:'COMPATIBILITY_CHECK_ONLY',targetAccepted:false,linked:false,
    time:timeCompatibility(snap.cutoff,'csv'),gaps:Object.entries(gapDescriptions).map(([id,description])=>({id,description,status:'UNVERIFIED_TARGET'})),
    cumulative:materials.status,details:materials.gaps,multiTimeDailyBatch:'NEEDS_ADAPTATION',mainProgramReady:false};
  const payload={schema:VERSION,scenario:d.scenario,branch:d.branch,lineage:copy(d.lineage),revision:d.revision,
    source:copy(d.spec.source),sourceSpecHash:d.specHash,snapshot:copy(snap),
    ...(d.spec.reference?{nativeSourceReference:copy(d.spec.reference)}:{}),
    history:d.checkpoints.map(c=>copy(c.snapshot)),
    // Full author scripts are deliberately excluded; only events actually known by this observation are visible.
    knownEvents:copy(d.spec.events.filter(e=>minute(e.knownAt)<minute(snap.cutoff))),
    nativeFields:copy(nativeCatalog),compatibility:report,
    candidateFiles:[{table:'executionMaterials',status:materials.status,rows:materials.rows}],
    extendedLedger:'独立仿真模拟账；不写原Excel页签，不直接发送主程序'};
  return {...payload,contentHash:fingerprint(payload)};
}
