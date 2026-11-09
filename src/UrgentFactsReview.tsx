import type {UrgentFactReview} from './lib/urgent-facts.mjs';
export function UrgentFactsReview({review,onLocate,problemCount=0}:{review:UrgentFactReview;onLocate:()=>void;problemCount?:number}){
 return <div className="urgent-facts-review" role="status" aria-live="polite"><span>任务状态已确认 {review.confirmedTasks}/{review.totalTasks}</span><span>未确认任务 {review.pendingTasks.length} 个</span>{review.pendingProgress.length>0&&<span>空白已完成工序量 {review.pendingProgress.length} 项</span>}<span>空白交付量 {review.pendingCompleted.length} 项</span><span>空白耗料/锁定量 {review.pendingAllocations.length} 项</span>{problemCount>0&&<span>数据校验问题 {problemCount} 项</span>}{review.blocked||problemCount>0?<button type="button" onClick={onLocate}>定位首个未完成项</button>:<span>必填项已填写，可保存</span>}</div>;
}
