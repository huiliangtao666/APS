import test from 'node:test';
import assert from 'node:assert/strict';
import {solverRequest,solverBudget,scaleDecimals,interpretSolver,solverHistory,comparisonConditions,requireCoverage} from '../server/solver-choice/contract.mjs';
import {validateMinuteModel} from '../server/solver-choice/model.mjs';
import {checkMinuteCandidate} from '../server/solver-choice/checker.mjs';
import {designMinuteModel,manualDesignCandidate} from './solver-choice-fixture.mjs';

test('SOL01/03/04 omitted choice alone defaults basic; malformed explicit values never fall back',()=>{
 assert.deepEqual(solverRequest({}),{requested:'basic'});
 for(const solver of ['',null,undefined,0,'CP-SAT','unknown',[],{}])assert.throws(()=>solverRequest({solver}),{code:'SOLVER_INVALID'});
 assert.deepEqual(solverRequest({solver:'cp-sat',solverMaxSeconds:4.25}),{requested:'cp-sat',maxSeconds:4.25});
});
test('SOL24 budget must have a source and reserves and may only be shortened',()=>{
 const effective={totalSeconds:90,deliverySeconds:10,checkSeconds:20,source:'TEST_CONTRACT_ONLY',version:'r1'};
 assert.equal(solverBudget({},effective).solveSeconds,60);
 assert.equal(solverBudget({maxSeconds:4},effective).solveSeconds,4);
 assert.throws(()=>solverBudget({maxSeconds:61},effective),{code:'SOLVER_BUDGET_EXCEEDED'});
 assert.throws(()=>solverBudget({},undefined),{code:'SOLVER_BUDGET_MISSING'});
 for(const solverMaxSeconds of [0,-1,NaN,Infinity,'3',null])assert.throws(()=>solverRequest({solver:'cp-sat',solverMaxSeconds}));
});
test('SOL10 exact scaling preserves approved precision and rejects truncation/overflow',()=>{
 assert.deepEqual(scaleDecimals(['0.125','10.000'],{unit:'千克',precision:3,field:'quantity'}).integers,[125,10000]);
 assert.throws(()=>scaleDecimals(['0.1251'],{unit:'千克',precision:3,field:'quantity'}),{code:'QUANTITY_PRECISION_EXCEEDED'});
 assert.throws(()=>scaleDecimals(['9007199254740992'],{unit:'个',precision:0,field:'quantity'}),{code:'QUANTITY_OVERFLOW'});
 assert.throws(()=>scaleDecimals(['1e-3'],{unit:'千克',precision:3,field:'quantity'}),{code:'QUANTITY_NOT_EXACT'});
});
test('SOL08 enabled unsupported/data-incomplete rule is a located block, not disabled',()=>{
 const rules=[{id:'shared-space',enabled:true,supported:false,dataComplete:true,version:'r1',objects:['SPACE1']}];
 assert.throws(()=>requireCoverage(rules),e=>e.code==='CONSTRAINT_UNSUPPORTED'&&e.details.rules[0].objects[0]==='SPACE1');
 assert.equal(rules[0].enabled,true);
});
test('SOL14-17/21 five raw statuses remain distinct; injected status tests are contract evidence only',()=>{
 for(const raw of ['INFEASIBLE','UNKNOWN','MODEL_INVALID'])assert.equal(interpretSolver(raw).executable,false);
 assert.match(interpretSolver('UNKNOWN').label,/未证明不可行/);
 assert.equal(interpretSolver('OPTIMAL',{hasCandidate:true}).label,'找到可行解');
 assert.match(interpretSolver('FEASIBLE',{hasCandidate:true}).label,/未证明最优/);
 assert.throws(()=>interpretSolver('FEASIBLE'),{code:'SOLVER_CANDIDATE_MISMATCH'});
 assert.throws(()=>interpretSolver('cancelled'),{code:'SOLVER_STATUS_INVALID'});
 assert.equal(interpretSolver('FEASIBLE',{hasCandidate:true,coverage:{complete:true,zeroScheduled:false},check:{status:'pass',notChecked:['material']}}).executable,false);
});
test('SOL22 old unknown stays unknown; metadata lookup never mutates old run/hash',()=>{
 const old={id:'old',resultHash:'preserved'},before=JSON.stringify(old);
 assert.equal(solverHistory(old).version,null);assert.equal(JSON.stringify(old),before);
});
test('SOL24 different/missing conditions are not called a fair comparison',()=>{
 const a={inputHash:'i',selectionHash:'s',rulesHash:'r',objectiveHash:'o',budgetHash:'b'};
 assert.equal(comparisonConditions(a,{...a}).comparable,true);
 assert.deepEqual(comparisonConditions(a,{...a,budgetHash:'shorter'}).differences,['budgetHash']);
 assert.equal(comparisonConditions({},{}).comparable,false);
});
test('immutable model hash is stable and mutations are refused',()=>{
 const raw=designMinuteModel(),m=validateMinuteModel(raw);
 assert.equal(validateMinuteModel(m).modelHash,m.modelHash);raw.tasks[0].duration=999;
 assert.equal(m.tasks[0].duration,17);m.tasks[0].duration=18;
 assert.throws(()=>validateMinuteModel(m));
});
test('SOL07/09/11/12 independent manual witness has 17 minutes, joint crew, tool tail and 10kg mass',()=>{
 const check=checkMinuteCandidate(designMinuteModel(),manualDesignCandidate());
 assert.equal(check.status,'pass',check.issues.join(';'));assert.equal(check.coverage.complete,true);
});
test('SOL19 independent checker vetoes solver-shaped resource/material/coverage errors',()=>{
 const cases=[
  c=>{c.tasks[2].start=28;c.tasks[2].end=41;c.allocations[1].feedMinute=28;},
  c=>{c.allocations[1].quantity=4001;},
  c=>{c.tasks.splice(1,1);},
  c=>{c.tasks[0].alternativeId='fake-machine';},
  c=>{c.allocations[0].feedMinute=-1;},
  c=>{c.tasks[3].start=25;c.tasks[3].end=34;},
  c=>{c.tasks=[];c.allocations=[];},
 ];
 for(const mutate of cases){const c=manualDesignCandidate();mutate(c);const check=checkMinuteCandidate(designMinuteModel(),c);assert.equal(check.status,'problem');}
});
test('SOL13 fixed execution cannot move; model rejects precedence cycles and missing demand obligations',()=>{
 const m=designMinuteModel();m.tasks[0].fixed={start:1,alternativeId:'M01'};
 assert.equal(checkMinuteCandidate(m,manualDesignCandidate()).status,'problem');
 m.tasks[0].predecessors=[{taskId:'A2',minLag:0,maxLag:null}];assert.throws(()=>validateMinuteModel(m));
 const empty=designMinuteModel();empty.demands[0].taskIds=[];assert.throws(()=>validateMinuteModel(empty));
});
test('SOL20 optional tasks require a referenced approved partial policy',()=>{
 const m=designMinuteModel();m.tasks[0].required=false;assert.throws(()=>validateMinuteModel(m));
 m.partialPolicy={kind:'explicit_partial',source:'test policy',version:'TEST_ONLY'};assert.doesNotThrow(()=>validateMinuteModel(m));
});
