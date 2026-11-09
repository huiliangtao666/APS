import {useEffect,useId,useState,type ReactNode} from 'react';
import {createPortal} from 'react-dom';

// Explain the source quantities and daily projection used by this read-only report.
export const mpsFieldHelp:Record<string,string>={
 id:'物料在当前来源版本中的唯一编号。点击总览中的编号，可查看该物料的日期矩阵。',
 name:'选定数据版本中的物料名称，与物料编号对应。',
 category:'物料主数据中的类别，例如成品、半成品、原辅料或包装材料。',
 source:'物料主数据中的制造或采购来源，用于区分适用的供给类型。',
 unit:'该物料的基础计量单位。不同物料或不同单位的数量不能直接合计。',
 snapshotDate:'原始库存批次记录的快照日期，不是当前查询的开始日期。混合快照不作为同一时点合计。',
 snapshotPhysical:'库存快照时点各批次记录的实物数量，质量状态需结合批次明细核对；不等于查询起点库存，也不包含未来采购或制造供给。',
 snapshotFree:'库存快照时点，合格且已放行、未到期实物扣除已记录占用后的自由量，最低为0。它不是查询起点库存，也不是可承诺量（ATP）。',
 sourceDemand:'区间内源需求记录的原始需求量，未扣除已发运量。缺少净剩余及发运记录时，独立净需求按此原始量展示。',
 sourceOrdered:'按预计到货日期归入区间的采购单订购总量。未提供净未收及收货记录时，采购到货和可用量按此订购量展示。',
 sourceWIP:'库存快照中的在制预计合格产出原数量。未提供入库净余及入库记录时，既有制造预计可用量按此数量展示。',
 queryOpening:'从合格、已放行、未到期库存扣除已记录占用量，按同源供需与批次失效推演到查询首日的预计余额；可为负数。',
 ownLead:'物料自身的参考提前期，单位为天；不是有限资源排程后的交付承诺。',
 cumulativeLead:'按有效BOM关键路径得到的累计参考提前期，单位为天；不是所有分支天数相加，也不证明资源可用。',
 risk:'按期末预计余额和安全库存目标显示需求缺口、低于安全库存或正常；来源缺失时显示来源未提供。',
 coverage:'说明当前输入或冻结计划对查询区间的覆盖及未覆盖事项。未覆盖与真实数量0不同。',
 bomRoots:'该物料因哪些已选根物料的有效BOM关系而显示。BOM展开只扩大显示范围，不生成额外需求。',
 independent:'优先取明确的净剩余需求量；否则按原始需求量减已发运量计算。未提供净剩余及发运记录时，直接显示原始需求量，按工厂发运日期归桶。',
 dependent:'读取同版本物料需求来源中的需料数量，优先净剩余量，其次扣除已投料量；无执行记录时显示原始需料数量。按来源需料日归桶，成功投料分配单列明细且不重复叠加。',
 demand:'同一日期、同一物料基础单位下的独立净需求与相关净需求之和。',
 opening:'本日日初的预计净余额，等于上一日期末结转；首日从合格已放行库存扣除已记录占用量开始推演。属于时点值，不按天累计。',
 arrival:'优先净未收数量，其次按订购量减已收量；未提供收货执行记录时，直接展示订购数量。按预计到货日期归桶，取消或冻结供给不计入。',
 purchase:'按采购净未收量展示；无收货执行记录时取订购量。归入“预计放行日”和“到货日＋检验天数”较晚的日期，取消、冻结和待检供给不计入。',
 firm:'优先读取尚未入库净余量，其次按预计合格产出减已入库量；无入库执行记录时展示预计合格产出。按预计放行日归桶，与新增主计划区分。',
 completion:'选定成功或部分完成计划中新制造的预计完工数量，按末道工序完成日期归桶，同一制造批次只计一次。完工不等于合格可用。',
 mps:'新增主计划末道工序产出数量，按完工时间加物料检验提前期后的预计可用日期归桶；不含既有在制供给，也不表示实际检验已完成。',
 expiry:'按已记录到期日扣除批次预计未使用的剩余量。需求按先到期先使用消耗，已消耗或已用于弥补前期缺口的数量不再扣减。',
 balance:'本日期末预计净余额＝期初预计净余额＋采购预计可用量＋既有制造预计可用量＋主计划预计可用量－净需求合计－预计失效扣减。可为负数；建议量不计入供给。',
 safety:'该日期有效的安全库存目标，按已有物料参数口径读取。它是目标值，不另外作为需求重复扣减；缺源不补0。',
 shortage:'需求缺口＝max(0，－预计期末净余额)。属于时点值，不按天累计，也不与安全库存不足相加。',
 safetyGap:'安全库存不足＝max(0，安全库存目标－预计期末净余额)。包含需求缺口，两项不重复相加。',
 suggestMake:'尚未下达的制造补货建议，按建议的合格可用日期归桶。仅供核对，不作为正式供给，也不会自动下达。',
 suggestBuy:'尚未下达的采购补货建议，按建议的放行可用日期归桶。明细另列下单、到货等日期，不计入基准供给。',
 recordId:'当前来源明细中的记录标识。点击可读取该记录的原始字段及文件、页签、源行等来源。',
 metric:'该行统计的业务指标。悬浮到具体指标名，可查看数量含义和日期归属。',
 kind:'区分流量、时点值和建议流量。流量按日期归桶；时点余额不按天求和，建议不进入基准供给。',
 dateBucket:'该列对应的日历日期。各行分别按需料、到货、完工或可用日期归桶；日末总量不能证明分钟齐套。',
 materialId:'该来源记录对应的物料编号，与总览和日期矩阵采用同一物料身份。',
 quantity:'该来源记录的业务数量。需结合记录类别、单位及条件核对，不把原数量、净余或建议量混为同一供给。',
 countedQuantity:'这条来源在所点指标、所点日期实际计入的数量。取消、冻结等被排除的来源计入0；来源业务数量仍单独保留。',
 calculationDate:'本行计算所对应的日历日期，与所点击的日期格一致，不是整个查询区间的汇总日期。',
 initialQuantity:'该批次纳入预计库存推演的数量。期初库存已扣除记录占用；后续供给采用对应预计可用数量。',
 consumedQuantity:'该批次到期前已被预计需求消耗的数量，包含用于弥补前期需求缺口的部分，不再重复计入失效扣减。',
 executed:'来源记录中已执行的数量：独立需求对应已发运量，相关需料对应已投料量，在制供给对应已入库量。',
 netRemaining:'来源明确记录的净剩余数量，优先于按原数量减已执行量推算的结果；明确的0也保留。',
 original:'该来源记录的原始数量，需结合记录类别查看。独立需求未提供净剩余及发运记录时，按原始需求量展示。',
 ordered:'采购单行的原订购数量。有已收记录时扣除已收量，无净未收及收货记录时直接按订购量展示。',
 received:'该采购单行已经收货的明确执行数量，用于核对净未收；未提供与实际0不同。',
 occupied:'源库存批次记录的占用总量。非零占用仍需区分本计划与外部归属，不能据总数推算精确可承诺量。',
 free:'库存快照时点，合格且已放行、未到期实物扣除记录占用后的自由量，最低为0；不是查询起点库存或ATP。',
 arrivalDate:'采购单行的预计到货日期；到货不代表检验或合格放行已完成。',
 availableDate:'供给预计达到可用条件的日期。采购须核对放行与到货加检验下限；制造须有明确放行依据。',
 releaseDate:'原始记录中的预计或已记录放行日期，需结合质量状态核对，不以到货或完工直接替代。',
 expiryDate:'批次到期的日期边界，达到失效边界后不可再作为合格供给。',
 completionDate:'制造批次的预计完工日期，不等于检验或合格放行可用日期。',
 needDate:'工厂侧的需料或发运需求日期，需与客户要求到货日期及运输规则区分。',
 condition:'该来源记录的条件供给、数据缺失、占用归属或未覆盖说明；不能忽略这些条件把数量视为已确认可用。',
};

export function MpsFieldHint({field,children}:{field:string;children:ReactNode}){
 const id=useId(),[anchor,setAnchor]=useState<{left:number;top:number;above:boolean}>(),description=mpsFieldHelp[field];
 useEffect(()=>{if(!anchor)return;const hide=()=>setAnchor(undefined);window.addEventListener('scroll',hide,true);window.addEventListener('resize',hide);return()=>{window.removeEventListener('scroll',hide,true);window.removeEventListener('resize',hide);};},[!!anchor]);
 if(!description)return <>{children}</>;
 function show(el:HTMLElement){const r=el.getBoundingClientRect();setAnchor({left:Math.max(8,Math.min(r.left,window.innerWidth-328)),top:r.bottom+155>window.innerHeight?r.top-7:r.bottom+7,above:r.bottom+155>window.innerHeight});}
 return <span className="mps-field-hint" tabIndex={0} aria-describedby={anchor?id:undefined} onMouseEnter={e=>show(e.currentTarget)} onMouseLeave={()=>setAnchor(undefined)} onFocus={e=>show(e.currentTarget)} onBlur={()=>setAnchor(undefined)} onKeyDown={e=>{if(e.key==='Escape'&&anchor){e.stopPropagation();setAnchor(undefined);}}}>
  {children}<span className="mps-hint-mark" aria-hidden="true">ⓘ</span>
  {anchor&&createPortal(<span role="tooltip" id={id} className="mps-field-tooltip" style={{left:anchor.left,top:anchor.top,transform:anchor.above?'translateY(-100%)':undefined}}>{description}</span>,document.body)}
 </span>;
}
