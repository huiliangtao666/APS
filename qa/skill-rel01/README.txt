FR014-SKILL-REL01 repair round1, APS-BL-001 v0.3 / Issue12

Run only inside a disposable application QA container. Copy this project over
aps-fr038-qa-runtime:latest /workspace/apps/aps-fr032, excluding .git,
node_modules and dist. This preserves the image dependencies without changing
the source workspace or a live app. Mount original/initial-inputs.json and an
output directory at /evidence/evidence. Browser cache is read-only.

From the project directory in that disposable container:
node --test src/lib/data-query.test.mjs src/lib/skill-rel01.test.mjs
node --experimental-strip-types --test qa/dec0203.test.mjs qa/dec0203-repair-r1.test.mjs
./node_modules/.bin/esbuild src/query-ui.test.tsx qa/fr014015-panel.test.tsx --jsx=automatic --bundle --platform=node --packages=external --format=cjs --out-extension:.js=.cjs --outdir=.qa-skill
node --test .qa-skill/src/query-ui.test.cjs .qa-skill/qa/fr014015-panel.test.cjs
npm run build
cp qa/skill-rel01/browser.mjs skill-rel01-browser.mjs
node --experimental-strip-types skill-rel01-browser.mjs

Browser fixture uses real React/Express and isolated JSON storage with explicit
synthetic actors/runtime. It is not real gateway SSO or business UAT. The runner
starts from Test original inputs plus three negative/multi-skill group controls;
expects GROUP1, PACK1, MULTI, excludes EMPTY and SUBSTRING. It records actual
navigation and a genuine calculated plan snapshot before changing current data.
The saved plan/input bytes remain unchanged. No confirmation fixture is forged.

Original baseline Test failure remains bound to
18c2f59761c9db69554f33a2870b68e15d092320. This repair does not re-sign old evidence.
Scope: declared skill references and explicit existing operation scope only.
Original01 category/entity acceptance remains PARTIAL and unimplemented here.
