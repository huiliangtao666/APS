// A known absence is distinct from a checked scheduled task. Never infer the
// business cause from translated text, task identity, or an empty finding list.
export function knownPartialFinding(f){
 return /^UNPLANNED \/ (HORIZON|CALENDAR|PREDECESSOR|MATERIAL|PERSONNEL|JOINT_RESOURCE)$/.test(f.code)
  || f.code==='UNPLANNED / PROCESS_PAIR'&&['HORIZON','CALENDAR','PREDECESSOR','MATERIAL','PERSONNEL','RESOURCE','MACHINE'].includes(f.unplannedCause);
}
export function knownMissingTasks(plan,missing){
 const scheduled=new Set((plan.tasks||[]).map(t=>t.id));
 const unplanned=(plan.resultAssessment?.tasks||[]).filter(t=>t.status==='unplanned');
 return missing.length>0&&new Set(missing).size===missing.length&&missing.every(id=>!scheduled.has(id)
  &&unplanned.some(t=>t.id===id&&Number.isFinite(t.quantity)&&t.quantity>=0&&t.unit&&t.reasons?.length&&t.reasons.every(r=>!['unknown','unresolved'].includes(r.classification)))
  &&(plan.findings||[]).some(f=>knownPartialFinding(f)&&f.taskIds?.includes(id)));
}
