export type MpsExplanation={headline:string;rule?:string;scope:string;emptyMessage:string;label?:string;date?:string|null;period?:string};

export function MpsDetailSummary({explanation}:{explanation:MpsExplanation}){
 return <section className="mps-detail-summary" aria-label="数据说明">
  <p className="mps-detail-lead">{explanation.headline}</p>
  {explanation.rule&&<p className="mps-detail-rule"><span>计算口径</span>{explanation.rule}</p>}
 </section>;
}
