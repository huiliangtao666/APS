import {atomicFields,parameterCatalog,sourceTable,canonicalCp} from './parameter-contract.mjs';
import {minuteAtomicFields} from './minute-parameter-fields.mjs';
import {cpImpacts,fieldGuides,enumGuides} from './parameter-help-content.mjs';
const minuteNames=new Set(minuteAtomicFields.map(f=>f.name));
const inputSpec=s=>s&&!s.readonly?Object.fromEntries(['type','values','min','max','inclusive','integer','unit'].filter(k=>s[k]!==undefined).map(k=>[k,s[k]])):undefined;
const relationPosition=c=>sourceTable(c['参数编号']);
export function parameterHelp(c,s,context={}){
 const cp=canonicalCp(c['参数编号']),field=s?.name||c['中文配置项'],guide=fieldGuides[field],table=s?.table||relationPosition(c),input=inputSpec(s);
 const meaning=guide?.[0]||`${c['中文配置项']}：${c['规则与边界']||'按该配置对象的来源记录维护。'}`;
 const options=s?.type==='enum'?s.values.map(value=>({value,meaning:enumGuides[field]?.[value]||(/时间单位/.test(field)?'当前支持的时间单位':`当前支持的${field}`)})):[];
 let bounds=options.length?'从下拉框选择；不使用0、1代替选项。':input?.type==='number'?
  [s.integer?'整数':'可填写小数',s.min!==null&&s.min!==undefined?`${s.inclusive?'≥':'>'}${s.min}`:'',s.max!==undefined?`≤${s.max}`:'',s.unit?`单位：${s.unit}`:'按页面所列单位'].filter(Boolean).join('；'):
  `${c['类型与单位']||'按来源结构填写'}；${c['规则与边界']||'对象引用及单位必须明确'}`;
 if(cp==='CP093')bounds+='；最小等待不得大于最大等待。';
 if(cp==='CP066')bounds+='；最低温度不得高于最高温度。';
 if(input?.type==='number'&&(c['最小值']||c['最大值']))bounds+='；目录补充边界：'+[c['最小值']&&'下限 '+c['最小值'],c['最大值']&&'上限 '+c['最大值']].filter(Boolean).join('，');
 const inactive=minuteNames.has(field)&&context.productionContract!=='workbook-minute-v2';
 const candidate=s?.candidate;
 const usage=inactive?'仅用于分钟模型；当前数据按日模型计算，保存此值不会切换模型或改变日模型的独占规则。':candidate?'当前仅保存候选参考资料，不参与排程计算。':guide?.[3]||(!input?'此目录项没有独立可执行值；查看或维护同源业务记录，不通过保存说明文字启用规则。':'保存后需重新检查并创建新运行；原有运行保留冻结配置。');
 return {cp,field,title:field,meaning,impact:cpImpacts[cp]||c['业务领域']||'对应业务对象与查询',usage,
  maintain:input?`${table?'在“'+table+'”对应对象行':'在对应全局对象'}维护“${field}”。${options.length?'选择下拉选项。':'按单位填写数值，不填写算式。'}`:table?'通过“维护'+table+'”查看或维护结构化来源；派生值应修改其来源字段。':'只读或规则资料；使用对应业务入口维护来源，不手填派生值。',
  bounds,zero:guide?.[1]||(input?.type==='number'?s.min!==null&&s.min!==undefined&&(s.min>0||s.min===0&&!s.inclusive)?'0不合法。':'数值为0；不是通用的关闭开关。':'未定义为0/1开关，不用0替代空值或对象引用。'),
  one:guide?.[2]||(input?.type==='number'?s.max!==undefined&&s.max<1||s.min!==null&&s.min!==undefined&&(s.min>1||s.min===1&&!s.inclusive)?'1不合法。':'数值为1；不是通用的启用开关。':'未定义为0/1开关，不用1代替对象引用。'),
  blank:'空白表示未维护或未知，不等于0、关闭或继承。关键缺项会在本次依赖检查中提示；候选值不会自动采用。',options,inputSpec:input,
  period:'生效日期和最后有效日期均包含；共享配置影响后续使用它的新运行，仅试算覆盖只影响该试算。'};
}
const refGuides={
 '路线工序编号':'一道具体工序记录的唯一身份，供前序和投料映射引用。',
 '路线编号':'同一条工艺路线的归属编号，用来组织该路线的各道工序。',
 '工序顺序':'工序在该路线中的先后次序，按数值升序处理。',
 '前序工序编号':'本工序需要等待完成的上一步工序编号；首工序可无前序。',
 '设备组编号':'本工序可选的设备组，必须引用已存在的设备组。',
 '班组编号':'提供本工序人员的班组，必须引用已有班组。',
 '所需工装类型':'本工序需要的工装类型，再由工装池映射到实体工装。',
 '投料位置':'该子件投入父项的工序，需要与实际路线投料映射一致。',
 '资源类别':'区分设备与工装；类别决定数量和容量的解释方式。',
 '资源组编号':'把设备或工装归入明确的设备组或工装类型池。',
 '物料来源':'采购物料走供给或采购建议，制造物料需要工艺路线。',
 '质量状态':'只有符合已支持质量状态的批次才可作为供给；未知状态不能默认合格。',
 '生产日':'批次实际生产日期，用于来源与效期核对。',
 '放行日':'该批次最早可用的日期；不等于入库日期。',
 '到期日':'批次失效日期，日期当天不再可用。',
};
export function relationParameterHelp(table,fields,context={}){
 return Object.fromEntries(fields.map(f=>{
  const spec=atomicFields.find(s=>s.table===table&&s.name===f.name);
  if(spec)return [f.name,parameterHelp(parameterCatalog.find(c=>c['参数编号']===spec.cp),spec,context)];
  const identity=/编号$/.test(f.name),date=/日$|日期/.test(f.name),derived=f.derived;
  return [f.name,{title:f.name,field:f.name,meaning:refGuides[f.name]||(derived?`${f.name}由来源字段计算，不手工覆盖。`:identity?`${table}中“${f.name}”的对象引用或身份，须与被引用记录一致。`:`${table}的${f.name}，按原始业务事实维护。`),impact:`${table}的对象识别、关联及来源校验`,maintain:derived?'修改对应来源字段后由系统重新计算。':date?'按此表规定的日期口径维护；不要把0/1当成关闭或启用。':'维护本对象的业务字段；唯一身份字段不能在原记录中修改。',bounds:`${f.type||'文字'}${f.unit&&f.unit!=='无'?'；单位：'+f.unit:''}`,zero:identity?'若无编号，按业务规定留空；0不是通用的无对象标记。':'0没有通用启停含义，按字段业务口径填写。',one:'1没有通用启停含义，按字段业务口径填写。',blank:'未维护或未知；引用字段需要先建立相应业务对象。',usage:derived?'派生字段只读。':'按实际采用的输入模型检查；保存资料不自动启用额外能力。',options:[]}];
 }));
}
