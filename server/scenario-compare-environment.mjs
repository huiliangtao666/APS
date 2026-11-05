import {validateCompareConfig} from './scenario-compare-policy.mjs';
// Values are supplied by the application's authorized runtime contract, never
// an HTTP readiness claim. Absence disables starts while preserving editing.
export function scenarioEnvironmentFromEnv(env=process.env){
 const keys=['APS_SCENARIO_MAX_SCENARIOS','APS_SCENARIO_RUN_SECONDS','APS_SCENARIO_BUDGET_SOURCE'];
 if(keys.every(k=>env[k]===undefined))return null;
 return validateCompareConfig({maxScenarios:Number(env[keys[0]]),runSeconds:Number(env[keys[1]]),budgetSource:env[keys[2]]});
}
