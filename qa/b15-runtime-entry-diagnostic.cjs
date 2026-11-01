// Host-side native Chrome observer. Never imported by the running adapter.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {performance} = require('node:perf_hooks');
const {chromium} = require('/Users/sg_cbb_mac_1/Library/Application Support/Praetor/vm-agentd/node_modules/playwright-core');

async function main() {
  const out = process.env.B15_ENTRY_EVIDENCE;
  if (!out || !fs.existsSync(path.join(out, 'admission.json'))) throw Error('supervisor admission required');
  const admission = JSON.parse(fs.readFileSync(path.join(out, 'admission.json')));
  if (!admission.allowed || admission.expiresEpochMs < Date.now()) throw Error('expired admission');
  const base = 'http://127.0.0.1:18252';
  const started = performance.now();
  const at = () => ({utc: new Date().toISOString(), elapsedMs: performance.now() - started});
  const save = (name, value) => fs.writeFileSync(path.join(out, name), typeof value === 'string' ? value : JSON.stringify(value, null, 2));
  const log = (type, detail) => fs.appendFileSync(path.join(out, 'browser-events.jsonl'), JSON.stringify({...at(), type, detail}) + '\n');
  let browser, context, page, cdp, fatalReason, finishing = false, closeResult;
  let stopResolve;
  const stopped = new Promise(resolve => { stopResolve = resolve; });
  const tasks = new Set(), scripts = new Map(), requests = new Map(), finishedPaths = new Set();
  const report = {started: at(), navigation: 0, contexts: 0, posts: 0, errors: [], checks: [], initScripts: 0, routes: 0, workers: 0};
  const fatal = (reason, details) => {
    if (finishing || fatalReason) return;
    fatalReason = reason;
    log('STOP', {reason, details});
    save('first-stop.json', {...at(), reason, details});
    stopResolve(reason);
  };
  const track = promise => {
    const task = promise.catch(error => { log('observer-error', String(error)); fatal('observer failure', String(error)); });
    tasks.add(task); task.finally(() => tasks.delete(task));
  };
  const guarded = async promise => {
    if (fatalReason) throw Error(fatalReason);
    const result = await Promise.race([promise, stopped.then(reason => { throw Error(reason); })]);
    if (fatalReason) throw Error(fatalReason);
    return result;
  };
  const stopWatcher = setInterval(() => {
    if (fs.existsSync(path.join(out, 'STOP'))) fatal('supervisor stop', fs.readFileSync(path.join(out, 'STOP'), 'utf8'));
  }, 100);
  const deadline = setTimeout(() => fatal('15 minute deadline'), 15 * 60 * 1000);
  try {
    browser = await guarded(chromium.launch({headless: true, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', args: ['--disable-background-networking']}));
    const browserCDP = await browser.newBrowserCDPSession();
    save('chrome-processes.json', await browserCDP.send('SystemInfo.getProcessInfo'));
    browser.on('disconnected', () => fatal('browser disconnected'));
    context = await guarded(browser.newContext({viewport: {width: 1280, height: 900}}));
    report.contexts++;
    page = await context.newPage();
    page.setDefaultTimeout(15000);
    page.on('pageerror', error => { const detail = {...at(), name: error.name, message: error.message, stack: error.stack}; report.errors.push(detail); log('pageerror', detail); fatal('pageerror', detail); });
    page.on('crash', () => fatal('page crash'));
    page.on('worker', worker => fatal('unexpected browser Worker', worker.url()));
    page.on('console', message => {
      log('console', {type: message.type(), text: message.text(), location: message.location()});
      if (message.type() === 'error') fatal('console error', {text: message.text(), location: message.location()});
    });
    page.on('request', request => {
      log('request', {url: request.url(), method: request.method()});
      if (!['GET', 'HEAD'].includes(request.method())) { report.posts++; fatal('unexpected mutation', {method: request.method(), url: request.url(), body: request.postData()}); }
    });
    page.on('requestfailed', request => { log('requestfailed', {url: request.url(), failure: request.failure()}); if (!finishing) fatal('request failed', {url: request.url(), failure: request.failure()}); });
    page.on('response', response => {
      log('response-headers', {url: response.url(), status: response.status()});
      if (response.status() >= 400) fatal('HTTP error', {url: response.url(), status: response.status()});
    });
    page.on('requestfinished', request => {
      const url = new URL(request.url());
      log('requestfinished', {url: request.url(), method: request.method(), timing: request.timing()});
      finishedPaths.add(url.pathname);
      if (url.pathname.startsWith('/api/')) track((async () => {
        const response = await request.response();
        const body = await response.body();
        const name = 'body-' + url.pathname.replace(/[^a-zA-Z0-9_-]/g, '_') + '-' + requests.size + '.json';
        save(name, body.toString('utf8'));
        const digest = crypto.createHash('sha256').update(body).digest('hex');
        requests.set(request, {path: url.pathname, status: response.status(), bytes: body.length, sha256: digest, file: name, ...at()});
        log('body-complete', requests.get(request));
      })());
    });
    cdp = await context.newCDPSession(page);
    cdp.on('Debugger.scriptParsed', event => { scripts.set(event.scriptId, event); log('scriptParsed', event); });
    cdp.on('Runtime.exceptionThrown', event => { log('Runtime.exceptionThrown', event); fatal('CDP exception', event); });
    cdp.on('Network.requestWillBeSent', event => log('CDP.request', event));
    cdp.on('Network.responseReceived', event => log('CDP.response', event));
    cdp.on('Network.loadingFinished', event => log('CDP.loadingFinished', event));
    cdp.on('Network.loadingFailed', event => { log('CDP.loadingFailed', event); if (!finishing) fatal('CDP network failed', event); });
    cdp.on('Debugger.paused', event => track((async () => {
      log('Debugger.paused', event);
      // Retrieve own data descriptors only: no evaluation, getters, or code injection.
      const facts = {event, frames: []};
      const inspection = (async () => {
        for (const frame of event.callFrames.slice(0, 2)) {
          const script = scripts.get(frame.location.scriptId);
          const source = await cdp.send('Debugger.getScriptSource', {scriptId: frame.location.scriptId});
          const file = 'fault-script-' + frame.location.scriptId + '.js';
          save(file, source.scriptSource);
          const line = source.scriptSource.split('\n')[frame.location.lineNumber] || '';
          const column = frame.location.columnNumber;
          const scopes = [], bindings = [];
          for (const scope of frame.scopeChain.filter(scope => ['local', 'closure'].includes(scope.type)).slice(0, 3)) {
            const properties = await cdp.send('Runtime.getProperties', {objectId: scope.object.objectId, ownProperties: true, generatePreview: true});
            bindings.push(...properties.result);
            scopes.push({type: scope.type, name: scope.name, properties: properties.result.slice(0, 80)});
          }
          const receivers = [];
          for (const match of line.matchAll(/\b([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*)\.some\s*\(/g)) {
            const distance = Math.abs(match.index + match[1].length + 1 - column);
            if (distance > 120) continue;
            const chain = match[1].split('.');
            let value = bindings.find(binding => binding.name === chain[0])?.value;
            const trace = [{name: chain[0], value}];
            for (const property of chain.slice(1)) {
              if (!value?.objectId) break;
              const descriptors = await cdp.send('Runtime.getProperties', {objectId: value.objectId, ownProperties: true, generatePreview: true});
              const descriptor = descriptors.result.find(item => item.name === property);
              value = descriptor?.value;
              trace.push({name: property, value, getterNotInvoked: !!descriptor?.get});
            }
            receivers.push({expression: match[1], distanceColumns: distance, trace, receiver: value, status: value ? 'actual own-descriptor value at paused frame' : 'UNRESOLVED; no evaluated guess'});
          }
          facts.frames.push({functionName: frame.functionName, location: frame.location, scriptURL: script?.url || frame.url, sourceMapURL: script?.sourceMapURL, file, sourceSha256: crypto.createHash('sha256').update(source.scriptSource).digest('hex'), excerpt: line.slice(Math.max(0, column - 450), column + 450), scopes, receivers});
          save('fault-scope-source.json', facts);
        }
      })();
      await Promise.race([inspection, new Promise(resolve => setTimeout(resolve, 2000))]);
      save('fault-scope-source.json', facts);
      await cdp.send('Debugger.resume').catch(() => {});
      fatal('debugger exception', facts);
    })()));
    await cdp.send('Network.enable');
    await cdp.send('Runtime.enable');
    await cdp.send('Debugger.enable');
    await cdp.send('Debugger.setPauseOnExceptions', {state: 'all'});
    report.capturesInstalled = at();
    save('capture-installed.json', report.capturesInstalled);
    report.navigation++;
    await guarded(page.goto(base + '/__qa/role/planner', {waitUntil: 'domcontentloaded', timeout: 45000}));
    await guarded(page.getByRole('button', {name: '数据与 CSV', exact: true}).click());
    log('data-tab-clicked', at());
    await guarded(page.getByRole('heading', {name: '主数据、单位与排程输入', exact: true}).waitFor());
    // Actual initial fetch completion, not a fixed delay or response substitution.
    await guarded(page.waitForLoadState('networkidle', {timeout: 45000}));
    await guarded(Promise.allSettled([...tasks]));
    if (!finishedPaths.has('/api/plans')) throw Error('actual GET /plans completion not observed');
    const sessionRow = [...requests.values()].find(row => row.path === '/api/session');
    if (!sessionRow) throw Error('session completion not captured');
    const session = JSON.parse(fs.readFileSync(path.join(out, sessionRow.file)));
    if (session.role !== 'planner' || !session.canWrite || !session.canExport) throw Error('native planner session mismatch');
    report.checks.push({id: 'DATA_ENTRY_AND_INITIAL_GET_COMPLETE', result: 'PASS', ...at()});
    save('data-dom.txt', await guarded(page.locator('body').innerText()));
    await guarded(page.screenshot({path: path.join(out, 'data-entry.png')}));
    await guarded(page.getByRole('button', {name: '排程工作台', exact: true}).click());
    await guarded(page.getByRole('heading', {name: '排程计算与范围核对', exact: true}).waitFor());
    save('schedule-dom.txt', await guarded(page.locator('body').innerText()));
    report.checks.push({id: 'SCHEDULE_RETURN', result: 'PASS', ...at()});
    report.recoverySelftest = true;
  } catch (error) {
    report.failure = error.stack || String(error);
    if (!fatalReason) fatal('diagnostic step failed', report.failure);
  } finally {
    finishing = true;
    clearInterval(stopWatcher); clearTimeout(deadline);
    if (context) { try { await context.close(); report.contextClosed = at(); } catch (error) { report.contextCloseError = String(error); } }
    if (browser) { try { await browser.close(); report.browserClosed = at(); } catch (error) { report.browserCloseError = String(error); } }
    await Promise.race([Promise.allSettled([...tasks]), new Promise(resolve => setTimeout(resolve, 2000))]);
    closeResult = {state: 'RELEASED', contextClosed: !!report.contextClosed, browserClosed: !!report.browserClosed, nodePID: process.pid, ...at()};
    save('request-bodies.json', [...requests.values()]); save('scripts.json', [...scripts.values()]);
    report.firstStop = fatalReason || null; report.finished = at();
    save('browser-report.json', report); save('browser-close.json', closeResult);
  }
  if (!report.recoverySelftest || fatalReason || !closeResult.browserClosed || !closeResult.contextClosed) process.exitCode = 1;
  console.log(JSON.stringify({recoverySelftest: !!report.recoverySelftest, firstStop: fatalReason, closeResult}));
}
if (require.main === module) main().catch(error => { console.error(error); process.exitCode = 1; });
