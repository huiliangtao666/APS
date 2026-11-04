import fs from 'node:fs';
import {isAbsolute} from 'node:path';
import {createHash} from 'node:crypto';
// Application-side provisioning supplies this receipt after its admitted native
// import/probe. Reading it never installs, probes, starts a process or claims a
// missing environment exists. HTTP requests cannot set the receipt location.
export function solverEnvironmentFromReceipt(){
 const file=process.env.APS_SOLVER141_ENVIRONMENT_RECEIPT;
 if(!file)return null;
 const unavailable=reason=>({availability:{available:false,reason},budget:null,runtime:null});
 if(!isAbsolute(file))return unavailable('依赖环境回执须为应用侧绝对路径');
 try{
  const stat=fs.statSync(file);if(!stat.isFile()||stat.size>64*1024)return unavailable('依赖环境回执格式或大小不合法');
  const raw=fs.readFileSync(file),e=JSON.parse(raw.toString('utf8'));
  if(e.contract!=='aps-solver-environment-receipt:v1'||e.nativeProbe?.result!=='PASS'||e.nativeProbe?.version!=='9.15.6755'||!e.nativeProbe.checkedAt||!e.nativeProbe.environmentHash)return unavailable('尚无同版官方CP-SAT导入核验回执');
  if(!isAbsolute(e.runtime?.python||'')||!fs.statSync(e.runtime.python).isFile()||e.runtime.environmentHash!==e.nativeProbe.environmentHash)return unavailable('已核解释器缺失或环境身份不一致');
  if(e.budget?.totalSeconds!==90||!e.budget.source||!e.budget.version)return unavailable('总预算须匹配当前运行槽90秒上限，交付与检查预留仍须明确供给');
  return {availability:{available:true,version:e.nativeProbe.version,checkedAt:e.nativeProbe.checkedAt,environmentHash:e.nativeProbe.environmentHash,receiptHash:createHash('sha256').update(raw).digest('hex')},runtime:e.runtime,budget:e.budget};
 }catch{return unavailable('依赖环境回执或已核解释器无法读取');}
}
