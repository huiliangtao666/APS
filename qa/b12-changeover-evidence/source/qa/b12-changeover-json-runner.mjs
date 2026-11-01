import {checkChangeovers} from '../src/lib/b12-changeover.mjs';
let bytes = '';
for await (const chunk of process.stdin) bytes += chunk;
process.stdout.write(JSON.stringify(JSON.parse(bytes).map(checkChangeovers)));
