export const factStatusNames={not_started:'未开工（可调）',started:'已开工（可调）',completed:'已完成（不可调）',locked:'已锁定（不可调）'};
export function factDate(day,origin='2026-10-31'){
 if(typeof day!=='number'||!Number.isFinite(day))return '未填写';
 const value=new Date(Date.parse(origin+'T00:00:00Z')+Math.floor(day)*86400000);return Number.isFinite(value.getTime())?value.toISOString().slice(0,10):'无效日期';
}
export function factProblem(code,title,reason,action,context={}){
 const label=context.taskId?'任务 '+context.taskId:context.demandId?'需求 '+context.demandId:context.section==='allocation'?'供给记录 '+(Number(context.key)+1):'执行事实';
 return {code,title,reason,action,...context,message:label+'：'+reason+' 处理方法：'+action};
}
const explanations={
 URGENT_DAY_DATE:['观察日期无效','请填写真实的模拟观察日期，格式为年-月-日。','observation'],
 URGENT_FACT_TIME:['观察日期不在允许范围','将观察日期设在当前计划窗口内，并且不早于已保存的观察日期；需要更远日期时先明确扩展计划窗口。','observation'],
 URGENT_FACT_INCOMPLETE:['任务状态记录不完整','保留已录入内容，重新核对当前基准中的全部任务，每个任务仅保留一条状态记录。','task'],
 URGENT_FACT_TASK_UNKNOWN:['任务已不属于当前基准','先保留当前录入，再重新打开最新基准的执行事实；不要提交已被替换的任务编号。','task'],
 URGENT_FACT_STATUS_REQUIRED:['还有任务未选择状态','逐项选择四种状态；只有确认均未开工时才使用批量确认。','task'],
 URGENT_COMPLETED_MISSING:['交付数量未填写','展开“逐需求已完成合格交付量”，填写实际交付千克数，未交付填 0。','completed'],
 URGENT_COMPLETED_INVALID:['交付数量不合法','检查交付量是否为空、为负、超过需求量或低于已保存值。修改任务状态不会撤销独立的交付记录。','completed'],
 URGENT_CONSUMPTION_FACT_MISSING:['耗料或锁定供给记录未完整确认','展开“实际已耗及锁定供给”，逐条确认实际数量和类型，未发生填 0。','allocation'],
 URGENT_CONSUMPTION_FACT_INVALID:['供给数量、类型、日期或来源不一致','核对该批次实际量不超过计划分配量；数量大于 0 时选择实耗或锁定，确认日期在窗口内，实耗不得晚于观察日。来源变化时重新核对当前基准。','allocation'],
 URGENT_CONSUMPTION_REGRESSION:['修改会撤销已有耗料或锁定记录','保留已保存的实际耗料数量、类型和日期；任务状态更正不会自动释放这些供给或回填库存。','allocation'],
 URGENT_COMPLETION_ALLOCATION:['交付量与成品实际耗用量不相等','对照该需求的成品供给记录，核对已交付量与实际耗用的成品数量，不能只改其中一处。','completed'],
 URGENT_TARGET_CHANGED:['计划已被其他操作更新','先保留当前修改，重新取得最新计划及执行事实后核对再保存；不要反复提交旧版本。',undefined],
 URGENT_SOURCE_CORRUPT:['原计划输入校验未通过','停止使用当前过期上下文，重新选择有效的基准计划；已有输入先保留。',undefined],
 URGENT_FROZEN_CORRUPT:['冻结数据校验未通过','保留当前录入并重新核对基准版本；不要用当前不一致的来源继续保存或排程。',undefined],
};
export function explainFactFailure(code,message,context={}){
 const spec=explanations[code]||['执行事实未通过校验','按提示核对对应任务、日期和数量后再保存。',undefined];
 return factProblem(code||'URGENT_FACT_INVALID',spec[0],message||spec[0],spec[1],{section:spec[2],...context});
}
