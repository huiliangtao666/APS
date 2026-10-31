// Standalone isolated QA process, never imported by the production application.
import {b2Host} from './b2-host.mjs';
if(process.env.B234_DISPOSABLE_QA!=='1'||process.env.NODE_ENV==='production')throw Error('Explicit isolated QA process required');
const f=await b2Host({dir:process.env.B234_HOST_DATA,browser:process.env.B234_BROWSER==='1'});
const ready={url:f.url,identity:'synthetic QA planner/supervisor/query',productSha:process.env.B2_PRODUCT_SHA||null};
if(process.send)process.send(ready);else console.log(JSON.stringify(ready));
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,async()=>{await f.close();process.exit(0);});
