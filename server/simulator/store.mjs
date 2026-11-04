import {promises as fs} from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {setImmediate} from 'node:timers/promises';
import {VERSION, SimulationError, requireThat as need, id, fingerprint, copy, canonical, nextDate} from './contract.mjs';
import {validateSpec, initialState, precheck, advanceDay, openingSnapshot, validateBalances} from './model.mjs';

const MAX_BYTES=32*1024*1024;
async function durableWrite(file,value,exclusive=false) {
  const tmp=file+'.'+randomUUID()+'.tmp'; let handle;
  try {
    handle=await fs.open(tmp,'wx',0o600);await handle.writeFile(canonical(value),'utf8');await handle.sync();await handle.close();handle=null;
    if(exclusive) {await fs.link(tmp,file);await fs.unlink(tmp);}else await fs.rename(tmp,file);
    const dir=await fs.open(path.dirname(file),'r');try{await dir.sync();}finally{await dir.close();}
  } finally {await handle?.close();await fs.unlink(tmp).catch(e=>{if(e.code!=='ENOENT')throw e;});}
}
export class SimulatorStore {
  constructor(root) {
    need(path.isAbsolute(root)&&path.basename(root)==='independent-simulator','STORE_ROOT','root','须使用独立绝对目录 independent-simulator');
    this.root=path.resolve(root);
  }
  async init() {
    await fs.mkdir(this.root,{recursive:true,mode:0o700});
    need((await fs.realpath(this.root))===this.root,'STORE_SYMLINK','root','模拟目录不允许符号链接');
    return this;
  }
  file(scenario,branch) {return path.join(this.root,id(scenario,'scenario')+'.'+id(branch,'branch')+'.json');}
  async lock(scenario,branch,fn) {
    const lock=this.file(scenario,branch)+'.lock';
    try{await fs.mkdir(lock,{mode:0o700});}catch(e){if(e.code==='EEXIST')throw new SimulationError('BRANCH_BUSY','branch','分支正由另一推进者持有；崩溃遗留锁须核实无活跃写者后人工处理',409);throw e;}
    try{return await fn();}finally{await fs.rmdir(lock);}
  }
  async read(scenario,branch) {
    const file=this.file(scenario,branch);let raw;
    try {
      const stat=await fs.lstat(file);need(stat.isFile()&&!stat.isSymbolicLink()&&stat.size<=MAX_BYTES,'STORE_FILE','branch','非普通文件或超过32MiB');
      raw=JSON.parse(await fs.readFile(file,'utf8'));
    }catch(e){if(e.code==='ENOENT')throw new SimulationError('BRANCH_NOT_FOUND','branch','分支不存在',404);throw e;}
    need(raw?.format===VERSION && raw.checksum===fingerprint(raw.document) && raw.document.scenario===scenario && raw.document.branch===branch,
      'CHECKPOINT_CORRUPT','branch','检查点损坏或身份不符；先对账，不重建空状态');
    const d=raw.document;validateSpec(d.spec);validateBalances(d.spec,d.state);
    need(d.specHash===fingerprint(d.spec),'SPEC_CONFLICT','spec','冻结规则内容已变化',409);
    return d;
  }
  async save(d,exclusive=false) {
    const wrapped={format:VERSION,document:d,checksum:fingerprint(d)};
    need(Buffer.byteLength(canonical(wrapped))<=MAX_BYTES,'STORE_LIMIT','branch','检查点超过32MiB，保留最后成功版本');
    await durableWrite(this.file(d.scenario,d.branch),wrapped,exclusive);
  }
  async create(scenario,branch,input,lineage=null,seed=null) {
    const spec=validateSpec(input),state=initialState(spec);validateBalances(spec,state);
    return this.lock(scenario,branch,async()=>{
      const d={scenario,branch,spec,specHash:fingerprint(spec),revision:1,nextDate:spec.startDate,lastSuccessfulDate:null,
        lineage:copy(lineage),state,checkpoints:[],operations:{},diagnostics:[],createdAt:new Date().toISOString()};
      if(seed) {
        d.state=copy(seed.state);d.checkpoints=copy(seed.checkpoints);d.lastSuccessfulDate=seed.lastSuccessfulDate;d.nextDate=nextDate(seed.lastSuccessfulDate);
        validateBalances(spec,d.state);
      }
      try{await this.save(d,true);}catch(e){if(e.code==='EEXIST')throw new SimulationError('BRANCH_EXISTS','branch','场景分支已存在，不覆盖历史',409);throw e;}
      return this.view(d);
    });
  }
  async list() {
    const files=await fs.readdir(this.root),out=[];
    for(const name of files.filter(n=>n.endsWith('.json'))) {
      const parts=name.slice(0,-5).split('.');if(parts.length!==2)continue;
      const d=await this.read(parts[0],parts[1]);out.push({scenario:d.scenario,branch:d.branch,revision:d.revision,
        lastSuccessfulDate:d.lastSuccessfulDate,nextDate:d.nextDate,lineage:d.lineage,source:d.spec.source});
    }
    return out;
  }
  view(d) {
    return {scenario:d.scenario,branch:d.branch,revision:d.revision,nextDate:d.nextDate,lastSuccessfulDate:d.lastSuccessfulDate,
      lineage:copy(d.lineage),source:copy(d.spec.source),mode:'INDEPENDENT',linked:false,
      precheck:precheck(d.spec,d.state,d.nextDate),checkpoints:d.checkpoints.map(c=>({id:c.id,date:c.date,businessHash:c.snapshot.businessHash})),
      current:d.checkpoints.length?copy(d.checkpoints.at(-1).snapshot):null,diagnostics:copy(d.diagnostics)};
  }
  async get(scenario,branch) {return this.view(await this.read(scenario,branch));}
  async pause(scenario,branch) {
    await this.read(scenario,branch);
    await durableWrite(this.file(scenario,branch)+'.pause',{requestedAt:new Date().toISOString()});
    return {paused:true,mode:'INDEPENDENT',message:'当前完整日结后停止后续推进'};
  }
  async isPaused(scenario,branch) {try{await fs.access(this.file(scenario,branch)+'.pause');return true;}catch(e){if(e.code==='ENOENT')return false;throw e;}}
  async resume(scenario,branch,expectedRevision) {
    return this.lock(scenario,branch,async()=>{const d=await this.read(scenario,branch);this.checkRevision(d,expectedRevision);
      await fs.unlink(this.file(scenario,branch)+'.pause').catch(e=>{if(e.code!=='ENOENT')throw e;});return this.view(d);});
  }
  checkRevision(d,expected) {need(Number.isSafeInteger(expected)&&expected===d.revision,'VERSION_CONFLICT','expectedRevision','版本已变化；查询检查点和操作回执后再决定',409);}
  async operation(scenario,branch,requestId) {
    const d=await this.read(scenario,branch);id(requestId,'requestId');
    return Object.hasOwn(d.operations,requestId)?copy(d.operations[requestId]):{status:'NOT_FOUND',message:'未发现此身份；核对内容及当前版本后决定'};
  }
  async advance(scenario,branch,{requestId,expectedRevision,days}) {
    id(requestId,'requestId');need(Number.isSafeInteger(days)&&days>0&&days<=366,'STEP_LIMIT','days','本次须明确1至366天终止步数');
    return this.lock(scenario,branch,async()=>{
      let d=await this.read(scenario,branch);const content=fingerprint({requestId,expectedRevision,days,specHash:d.specHash});
      let operation=Object.hasOwn(d.operations,requestId)?d.operations[requestId]:null;
      if(operation) {
        need(operation.content===content,'REQUEST_CONFLICT','requestId','同推进身份内容不同，须先对账',409);
        if(operation.status!=='RUNNING')return {operation:copy(operation),view:this.view(d)};
      }else {
        this.checkRevision(d,expectedRevision);
        let end=d.nextDate;for(let i=1;i<days;i++)end=nextDate(end);
        need(end<=d.spec.endDate,'DATE_RANGE','days','请求终止点超出场景覆盖；不静默缩短');
        operation={requestId,content,status:'RUNNING',requestedDays:days,completedDays:0,from:d.nextDate,checkpointIds:[]};
        d.operations[requestId]=operation;d.revision++;await this.save(d);
      }
      for(let i=operation.completedDays;i<days;i++) {
        if(await this.isPaused(scenario,branch)){operation.status='PAUSED';break;}
        const working=copy(d), day=d.nextDate;
        try {
          const result=advanceDay(d.spec,d.state,day), checkpoint={id:'CP-'+day,date:day,state:result.state,snapshot:result.snapshot,operationId:requestId};
          working.state=result.state;working.checkpoints.push(checkpoint);working.lastSuccessfulDate=day;working.nextDate=nextDate(day);
          const op=working.operations[requestId];op.completedDays++;op.checkpointIds.push(checkpoint.id);
          working.revision++;await this.save(working);d=working;operation=d.operations[requestId];
        }catch(e) {
          // A failed rename/fsync has an unknown outcome; do not overwrite the last file or automatically replay it.
          if(!(e instanceof SimulationError))throw e;
          operation.status='FAILED';operation.error={code:e.code,path:e.path,message:e.message,date:day};
          d.diagnostics.push({...operation.error,requestId});break;
        }
        await setImmediate(); // Gives an explicit pause request a boundary between committed days.
      }
      if(operation.completedDays===days)operation.status='COMPLETED';
      d.revision++;await this.save(d);return {operation:copy(operation),view:this.view(d)};
    });
  }
  async fork(scenario,branch,{newBranch,checkpointId,expectedRevision,replacementSpec}) {
    id(newBranch,'newBranch');
    return this.lock(scenario,branch,async()=>{
      const d=await this.read(scenario,branch);this.checkRevision(d,expectedRevision);
      const cp=checkpointId?d.checkpoints.find(c=>c.id===checkpointId):null;
      need(!checkpointId||cp,'CHECKPOINT_NOT_FOUND','checkpointId','检查点不存在');
      const spec=replacementSpec?validateSpec(replacementSpec):copy(d.spec);
      if(cp) {
        need(fingerprint(spec.source.baseline)===fingerprint(d.spec.source.baseline)&&fingerprint(spec.source.parameters)===fingerprint(d.spec.source.parameters)&&
          fingerprint(spec.materials)===fingerprint(d.spec.materials)&&fingerprint(spec.tasks)===fingerprint(d.spec.tasks)&&fingerprint(spec.resources)===fingerprint(d.spec.resources),
          'FORK_BASELINE_CONFLICT','replacementSpec','检查点恢复须同基线/参数/主数据；改基线请另建场景');
        for(const [eventId,receipt] of Object.entries(cp.state.processed))
          need(spec.events.some(e=>e.id===eventId&&fingerprint(e)===receipt.hash),'HISTORY_CONFLICT',eventId,'已应用历史不能修改；须从更早检查点新分支重放');
        const cutoff=cp.snapshot.cutoff;
        for(const e of spec.events)if(!Object.hasOwn(cp.state.processed,e.id))
          need(Math.max(Date.parse(e.occurredAt),Date.parse(e.knownAt),Date.parse(e.effectiveAt))>=Date.parse(cutoff),
            'HISTORICAL_INSERT',e.id,'历史补录须显式新生效/可知时点，不能倒改检查点');
      }
      const lineage={scenario,parentBranch:branch,checkpointId:cp?.id??'INITIAL',parentBusinessHash:cp?.snapshot.businessHash??fingerprint(initialState(d.spec)),parentSpecHash:d.specHash};
      await this.create(scenario,newBranch,spec,lineage,cp?{state:cp.state,checkpoints:d.checkpoints.filter(c=>c.date<=cp.date),lastSuccessfulDate:cp.date}:null);
      return this.get(scenario,newBranch);
    });
  }
  async opening(scenario,branch) {const d=await this.read(scenario,branch);return openingSnapshot(d.spec,d.state,d.nextDate);}
  async compare(scenario,branch,from,to) {
    const d=await this.read(scenario,branch),get=k=>{const cp=d.checkpoints.find(c=>c.id===k);need(cp,'CHECKPOINT_NOT_FOUND',k,'检查点不存在');return cp.snapshot;};
    const before=get(from),after=get(to),changes=[];
    for(const table of ['lots','purchases','demands','tasks','resources','holds','issues']) {
      if(fingerprint(before[table])!==fingerprint(after[table]))changes.push({table,before:before[table],after:after[table]});
    }
    return {from,to,beforeHash:before.businessHash,afterHash:after.businessHash,changes};
  }
}
