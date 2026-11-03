import type {FindingExplanation} from './lib/workbook-explanations.mjs';
import './WorkbookFindingExplanation.css';
export function WorkbookFindingExplanation({explanation:e}:{explanation:FindingExplanation}){
 return <dl className="workbook-finding-explanation"><dt>处理规则</dt><dd>{e.logic}</dd>{e.facts.length>0&&<><dt>本次判定依据</dt><dd>{e.facts.map((f,i)=><span key={i}>{f}</span>)}</dd></>}<dt>结果处理</dt><dd>{e.effect}</dd><dt>完善位置</dt><dd>{e.action}</dd><dt>证据说明</dt><dd>{e.limitation}</dd></dl>;
}
export function WorkbookRuleDetails({explanations}:{explanations:FindingExplanation[]}){
 return <section className="workbook-rule-details" aria-label="处理规则明细">{explanations.map((e,i)=><article key={i}><header><b>{e.need||'未关联需求'} · {e.title}</b></header><WorkbookFindingExplanation explanation={e}/></article>)}</section>;
}
