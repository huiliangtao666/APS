import {defs} from '../server/planner.ts';
import {uat15,uat17,uat18} from './b15-test-fixture.mjs';

// The application CSV boundary persists every declared column, including blank
// optional scrap fields. Supply a matching explicit genesis mock ledger; never
// rewrite an existing ledger or infer values for those fields.
export function b15DevScenario(id,changed=false){
 const d=id==='15'?uat15():id==='17'?uat17():uat18(changed);
 for(const def of defs)d[def.key]=(d[def.key]||[]).map(row=>Object.fromEntries(def.fields.map(field=>[field,row[field]??''])));
 for(const row of d.originalResourceEvents||[]){
  const doc=JSON.parse(row['原账JSON']);
  for(const f of doc.facts)f.snapshot=structuredClone(d.executionFacts.find(x=>x['事实编号']===f.factId));
  row['原账JSON']=JSON.stringify(doc);
 }
 return d;
}
