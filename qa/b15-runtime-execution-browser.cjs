// Native source UI; one browser/context, no INIT, routes, response stubs or Worker.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const {chromium} = require('/Users/sg_cbb_mac_1/Library/Application Support/Praetor/vm-agentd/node_modules/playwright-core');

(async () => {
  const out = process.env.B15_EXECUTION_EVIDENCE;
  const admission = JSON.parse(fs.readFileSync(path.join(out, 'browser-admission.json')));
  assert.ok(admission.allowed && admission.expires > Date.now() / 1000);
  const access = JSON.parse(fs.readFileSync(path.join(out, 'candidate-access.json')));
  const base = 'http://127.0.0.1:18301';
  const save = (name, data) => fs.writeFileSync(path.join(out, name), typeof data === 'string' ? data : JSON.stringify(data, null, 2));
  const report = {checks: [], errors: [], contexts: 0, posts: [], initScripts: 0, routes: 0, workers: 0};
  let browser, context, page, fatal, finishing = false;
  const stop = setInterval(() => {
    if (fs.existsSync(path.join(out, 'STOP'))) {
      fatal = fs.readFileSync(path.join(out, 'STOP'), 'utf8');
      context?.close().catch(() => {});
    }
  }, 100);
  const pass = id => { if (fatal) throw Error(fatal); report.checks.push({id, result: 'PASS'}); };
  try {
    browser = await chromium.launch({headless: true, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', args: ['--disable-background-networking']});
    context = await browser.newContext({viewport: {width: 1440, height: 1000}, acceptDownloads: true});
    report.contexts++;
    const cdp = await browser.newBrowserCDPSession();
    save('chrome-processes.json', await cdp.send('SystemInfo.getProcessInfo'));
    page = await context.newPage();
    page.setDefaultTimeout(15000);
    page.on('pageerror', error => { report.errors.push(error.stack); fatal = error.stack; context.close().catch(() => {}); });
    page.on('crash', () => { fatal = 'page crashed'; });
    page.on('worker', () => { report.workers++; fatal = 'unexpected browser Worker'; context.close().catch(() => {}); });
    page.on('request', req => {
      if (req.method() !== 'GET') {
        report.posts.push({url: req.url(), method: req.method(), body: req.postData()});
        if (!req.url().endsWith('/api/export')) { fatal = 'unexpected browser mutation'; context.close().catch(() => {}); }
      }
    });
    page.on('console', msg => { if (msg.type() === 'error') { fatal = msg.text(); report.errors.push(fatal); context.close().catch(() => {}); } });
    const tp = () => page.getByRole('region', {name: '方案副本与比较', exact: true});
    const mp = () => page.getByRole('region', {name: '试算任务移动与锁定', exact: true});
    async function open(role) {
      await page.goto(base + '/__qa/role/' + role, {waitUntil: 'networkidle'});
      await page.getByLabel('操作原因', {exact: true}).fill('Issue48 explicit mock native selftest');
      await tp().getByLabel('独立试算', {exact: true}).selectOption(access.trialId);
      await mp().waitFor();
    }
    await open('planner');
    for (const task of ['A-MIX', 'B-MIX']) {
      await mp().getByLabel('移动任务', {exact: true}).selectOption(task);
      assert.equal(await mp().getByRole('button', {name: '移动任务 ' + task, exact: true}).isDisabled(), true);
      assert.equal(await mp().getByRole('button', {name: '预览移动', exact: true}).isDisabled(), true);
      assert.equal(await mp().getByRole('button', {name: '预览锁定', exact: true}).isDisabled(), true);
      await mp().screenshot({path: path.join(out, task + '-protected.png')});
      pass(task + '_native_UI_move_lock_disabled');
    }
    await page.getByLabel('已保存方案', {exact: true}).selectOption(access.baselinePlanId);
    await Promise.all([
      page.waitForEvent('download').then(download => download.saveAs(path.join(out, 'native-ui.csv'))),
      page.getByRole('button', {name: '导出 CSV', exact: true}).click()
    ]);
    assert.deepEqual(fs.readFileSync(path.join(out, 'native.csv')), fs.readFileSync(path.join(out, 'native-ui.csv')));
    pass('native_UI_download_matches_API_native_exact_bytes');
    await page.getByRole('button', {name: '模拟数据查询', exact: true}).click();
    const query = page.getByRole('region', {name: '模拟数据查询', exact: true});
    await query.getByLabel('查询方案', {exact: true}).selectOption(access.baselinePlanId);
    await query.getByLabel('查看所选方案计算时的输入', {exact: true}).check();
    await query.getByLabel('查询数据类别', {exact: true}).selectOption('executionFacts');
    await query.getByRole('button', {name: '查看第1条详情', exact: true}).click();
    const text = await query.getByRole('region', {name: '记录详情', exact: true}).innerText();
    assert.match(text, /MOCK-EXEC48-STARTED/);
    save('frozen-fact-source.txt', text);
    await query.screenshot({path: path.join(out, 'frozen-fact-source.png')});
    pass('native_historical_query_frozen_started_source');
    await open('query');
    await mp().getByLabel('移动任务', {exact: true}).selectOption('A-FILL');
    assert.equal(await mp().getByRole('button', {name: '预览移动', exact: true}).isDisabled(), true);
    pass('query_role_native_readonly');
    save('final-dom.txt', await page.locator('body').innerText());
    assert.deepEqual(report.errors, []);
    report.result = 'PASS';
  } catch (e) {
    report.result = 'FAIL'; report.error = e.stack; process.exitCode = 1;
  } finally {
    finishing = true;
    clearInterval(stop);
    if (context) { await context.close(); report.contextClosed = true; }
    if (browser) { await browser.close(); report.browserClosed = true; }
    report.finished = new Date().toISOString();
    report.stopReason = fatal || null;
    save('browser-result.json', report);
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
