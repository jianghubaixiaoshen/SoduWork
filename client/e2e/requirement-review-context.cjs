'use strict';
// Real Hub records and native IPC preparation reach a real Pi SDK request; only the provider is synthetic.
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const assert = require('node:assert/strict'), vm = require('node:vm');
const { spawn, spawnSync } = require('node:child_process');
const electron = require('electron'), client = path.resolve(__dirname, '..');
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const read = file => fs.readFileSync(path.join(client, file), 'utf8');

if (typeof electron === 'string') {
  (async () => {
    const output = process.argv[2], python = process.argv[3] || process.env.SODUWORK_TEST_PYTHON;
    assert.ok(path.isAbsolute(output || '') && python, 'Absolute output and test Python are required');
    fs.mkdirSync(output, { recursive: true });
    const root = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'soduwork-collab-e2e-'));
    const probe = require('node:net').createServer();
    await new Promise(resolve => probe.listen(0, '127.0.0.1', resolve));
    const port = probe.address().port; await new Promise(resolve => probe.close(resolve));
    const hub = 'http://127.0.0.1:' + port, log = fs.openSync(path.join(output, 'hub.log'), 'w');
    const server = spawn(python, ['-m', 'uvicorn', 'tests.acceptance_browser_server:app', '--host', '127.0.0.1', '--port', String(port)], {
      cwd: path.join(client, '../hub-backend'), env: { ...process.env, SODUWORK_COLLAB_E2E_ROOT: root,
        AUTH_SECRET: 'review-context-synthetic-auth-secret-2026', ADMIN_PASS: 'synthetic-review-password' }, stdio: ['ignore', log, log],
    });
    try {
      let ready = false;
      for (let i = 0; i < 180; i++) {
        try { ready = (await (await fetch(hub + '/ready')).json()).isolated === true; } catch (_) {}
        if (ready || server.exitCode !== null) break; await wait(100);
      }
      assert.ok(ready, 'The isolated Hub must start');
      const env = { ...process.env };
      for (const key of ['ELECTRON_RUN_AS_NODE', 'NODE_OPTIONS', 'ELECTRON_NO_ATTACH_CONSOLE']) delete env[key];
      const result = spawnSync(electron, [__filename, output, hub], { env, encoding: 'utf8', timeout: 240000 });
      fs.writeFileSync(path.join(output, 'electron.log'), (result.stdout || '') + (result.stderr || '') + (result.error?.stack || ''));
      process.stdout.write(result.stdout || ''); process.stderr.write(result.stderr || '');
      assert.equal(result.status, 0, result.error?.message || 'Electron failed; inspect report.json');
    } finally {
      server.kill(); await Promise.race([new Promise(resolve => server.once('exit', resolve)), wait(3000)]);
      fs.closeSync(log); fs.rmSync(root, { recursive: true, force: true });
    }
  })().catch(error => { console.error(error); process.exitCode = 1; });
} else {
  const { app, BrowserWindow, ipcMain } = electron;
  const [output, hub] = process.argv.slice(2), root = fs.mkdtempSync(path.join(os.tmpdir(), 'soduwork-review-context-'));
  assert.ok(path.isAbsolute(output || '') && /^http:\/\/127\.0\.0\.1:\d+$/.test(hub || ''));
  app.setPath('userData', path.join(root, 'profile')); app.disableHardwareAcceleration();
  const report = { ok: false, platform: process.platform, electron: process.versions.electron, chromium: process.versions.chrome,
    checks: [], errors: [], boundary: 'Real Electron Chromium mouse input and production NativeChat controllers; verbatim production sendConversation IPC, task-input, attachment staging, acceptance preparation, Pi session and SDK, and loopback SSE HTTP. Real isolated Hub authentication, SQLite, dispatch notes, rejection, fixed delivery and review endpoints. Provider output/report generation, native session discovery and shell/plugin/memory discovery are fixtures. No production model, installed desktop profile, remote executor or Windows validation.' };
  const calls = [], completions = [], captures = [];
  let win, identity, active, provider, triggerMutation;
  const originalFetch = global.fetch;
  global.fetch = async (url, options) => {
    const response = await originalFetch(url, options);
    const body = typeof options?.body === 'string' ? JSON.parse(options.body)
      : options?.body instanceof FormData ? Object.fromEntries([...options.body.entries()].map(([key, value]) =>
        [key, typeof value === 'string' ? value : { name: value.name, size: value.size, type: value.type }])) : null;
    if (String(url).startsWith(hub + '/api/v1/')) calls.push({ route: new URL(String(url)).pathname,
      method: options?.method || 'GET', body, status: response.status });
    return response;
  };
  const js = code => win.webContents.executeJavaScript(code, true);
  async function request(route, body, method = body ? 'POST' : 'GET') {
    const response = await fetch(hub + '/api/v1' + route, { method, headers: { 'Content-Type': 'application/json',
      Authorization: 'Device ' + identity.session }, ...(body ? { body: JSON.stringify(body) } : {}) });
    const data = await response.json(); assert.equal(response.status, 200, route + ': ' + JSON.stringify(data)); return data;
  }
  async function note(taskId, value, suffix) {
    const route = '/tasks/' + taskId + '/conversation-turn';
    const scope = { conversationId: taskId + '-chat', turnId: suffix, executor: 'native', submissionMode: 'auto',
      dispatchInstructions: { note: value, submissionMode: 'auto' } };
    await request(route, { ...scope, action: 'prepare' });
    await request(route, { ...scope, action: 'cancel' });
  }
  async function delivery(taskId, round, text) {
    const route = '/tasks/' + taskId, scope = { conversationId: taskId + '-chat', turnId: 'delivery-' + round,
      executor: 'native', submissionMode: 'auto', ...(text ? { dispatchInstructions: { note: text, submissionMode: 'auto' } } : {}) };
    for (const action of ['prepare', 'start']) await request(route + '/conversation-turn', { ...scope, action });
    await require('../main/pi-session/task-delivery.cjs').send(identity, route, scope, { outcome: 'completed', model: '',
      files: [{ name: 'result.txt', category: 'primary', contentType: 'text/plain',
        data: Buffer.from('Synthetic delivery revision ' + round).toString('base64') }] });
    await request(route + '/conversation-turn', { ...scope, action: 'complete' });
    return request(route + '/acceptance-context');
  }
  async function seed(id, newest, long = false) {
    const body = 'Original requirement: write 400 words.' + (long ? '\n' + 'Original full context. '.repeat(350) + ' BASELINE-END' : '');
    await request('/tasks/' + id, { title: 'Review context ' + id, note: body, status: 'todo', triageStage: 'ready',
      kind: 'requirement', acceptanceCriteria: ['Write 400 words; retain every requested subject.'] }, 'PUT');
    const definitions = (await request('/tasks/' + id + '/events')).events.filter(row => row.kind === 'requirement.definition');
    assert.equal(definitions.length, 1, 'Normal HTTP creation records the original definition once');
    await request('/tasks/' + id, { priority: 'high', tags: ['review-context'] }, 'PUT');
    await request('/tasks/' + id + '/prepare-execution', {});
    if (long) for (let i = 0; i < 5; i++) await note(id, 'Historical supplement ' + i + ': ' + 'detail '.repeat(220) + ' END-' + i, 'long-' + i);
    const first = await delivery(id, 1, 'Supplement target: write 200 words. EARLY-SUPPLEMENT-END');
    await request('/approvals/' + first.approvalId + '/decision', { decision: 'reject', note: 'Rework target: write 300 words. REWORK-END' });
    const context = await delivery(id, 2, newest === 'supplement' ? 'Latest supplement target: write 250 words. LATEST-SUPPLEMENT-END' : '');
    assert.ok(!context.task.workRouting?.reworkPending, 'Consumed rework must still survive in authoritative history');
    const timeline = context.requirementTimeline.rows;
    const baseline = timeline.find(row => row.kind === 'requirement');
    assert.ok(baseline?.at, 'Production creation and claim preserve a known original content timestamp');
    assert.equal(Math.floor(Date.parse(baseline.at)), Number(definitions[0].at),
      'Metadata updates and claiming execution must not manufacture a newer business requirement');
    const rework = timeline.find(row => row.kind === 'rework'), supplement = timeline.filter(row => row.kind === 'supplement').at(-1);
    assert.ok(rework && supplement);
    assert.ok(newest === 'supplement' ? Date.parse(supplement.at) > Date.parse(rework.at) : Date.parse(rework.at) > Date.parse(supplement.at));
    return context;
  }
  async function until(code, ms = 15000) {
    const end = Date.now() + ms;
    while (Date.now() < end) { if (await js(code)) return; await wait(30); }
    throw Error('Timed out: ' + code + '\n' + await js('JSON.stringify({errors,toasts,text:document.body.innerText})'));
  }
  async function click(selector) {
    await until(`(()=>{const n=document.querySelector(${JSON.stringify(selector)});return n&&!n.disabled&&n.getBoundingClientRect().width>0})()`);
    const point = await js(`(()=>{const n=document.querySelector(${JSON.stringify(selector)});n.scrollIntoView({block:'center',behavior:'instant'});
      const b=n.getBoundingClientRect();return{x:Math.round(b.x+b.width/2),y:Math.round(b.y+b.height/2)}})()`);
    for (const type of ['mouseDown', 'mouseUp']) win.webContents.sendInputEvent({ type, ...point, button: 'left', clickCount: 1 });
  }
  async function open(context, mode) {
    if (provider) await provider.close();
    provider = await require('./fixtures/resumed-pi.cjs').create(path.join(root, context.task.id + '-' + mode));
    await provider.open(); active = provider.handle;
    await require('../main/conversation/acceptance-session').attach({ isPackaged: false, getPath: () => root }, active,
      { acceptanceSession: true, taskRef: context.task.id, acceptanceMode: mode, approvalId: context.approvalId }, identity);
    const submit = active.submit.bind(active);
    active.submit = (text, files, options) => {
      captures.push({ text, promptText: options.promptText, submissionId: options.submissionId });
      const submitted = submit(text, files, options); completions.push(submitted.completion); return submitted;
    };
    provider.reply(async () => {
      if (triggerMutation) { const mutate = triggerMutation; triggerMutation = null; await mutate(); }
      if (mode === 'auto') {
        const prompt = captures.at(-1).promptText;
        const match = prompt.match(/UTF-8 JSON 写入 ("[^\n]+")，每条标准/);
        assert.ok(match, 'The actual runtime prompt specifies the report destination');
        fs.writeFileSync(JSON.parse(match[1]), JSON.stringify({ verdict: 'approve', summary: 'Synthetic provider verified the selected timeline',
          checks: context.criteria.map(row => ({ criterion: row.id, result: 'pass', evidence: 'Synthetic fixture evidence; latest instruction timestamp retained.' })) }));
      }
      return { text: 'Synthetic review analysis completed; original, supplemental and rework instructions were inspected.' };
    });
    await js(`NativeChat.reset();window.task=${JSON.stringify(context.task)};window.reviewContext=${JSON.stringify(context)};
      window.runtimeSession=${JSON.stringify({ ref: active.ref, sessionId: active.sessionId })};window.reviewMode=${JSON.stringify(mode)};
      window.model={id:'local:model-'+ 'c'.repeat(32),label:'Private fixture model',localOnly:true};void 0;`);
    assert.equal(await js(`NativeChat.openTask(task.id,task.title,{task,source:'acceptance',acceptanceSession:true,
      approvalId:reviewContext.approvalId,acceptanceMode:reviewMode,acceptanceContext:reviewContext,
      requirementTimeline:reviewContext.requirementTimeline,acceptanceInstruction:'Check spelling. REVIEWER-NOTE-END',
      sessionOptions:{adapterId:'pi',modelName:model.id}})`), true);
    await until("document.querySelector('#nchatInput')&&fixtureContext._sessionOptions.acceptanceInstruction.includes('REVIEWER-NOTE-END')");
  }
  app.whenReady().then(async () => {
    try {
      const response = await fetch(hub + '/api/v1/clients/enroll', { method: 'POST', headers: { 'Content-Type': 'application/json',
        'X-Device-Key': 'isolated-requirements-fixture-key-never-production' }, body: JSON.stringify({ device: 'e2e-recipient', name: 'Review context fixture' }) });
      assert.equal(response.status, 200); identity = { hub, clientId: 'e2e-recipient', session: (await response.json()).session };
      const nativeModules = {
        './skill-turn': require('../main/pi-session/skill-turn'), '../conversation/requirement-context': require('../main/conversation/requirement-context'),
        '../conversation/acceptance-session': require('../main/conversation/acceptance-session'),
        './app-mcp-grant.cjs': { nativePluginId: () => '', guardSend() {} }, '../app-conversation-connection.cjs': { association: () => '' },
      };
      const main = vm.createContext({ require: name => { assert.ok(nativeModules[name], name); return nativeModules[name]; }, ipcMain,
        app: { isPackaged: false, getPath: () => root }, path, session: { get: ref => ref === active?.ref ? active : null },
        sendIdentityOf: async () => identity, identityOf: async () => identity, memories: { assertOwner() {} },
        updateWorkloads: { guard: () => ({ ok: true }) }, _cloudHandoff: { guard: () => false }, workDir: () => root,
        startReceipts: {}, taskInput: require('../main/pi-session/task-input'), attachments: require('../main/pi-session/attachments'),
        pluginDebug: { guard: () => '', submitConversation: async () => null }, BrowserWindow, authorizeAI: undefined,
        _publish() {}, _uiWindow: { snapshot: () => active.snapshot() }, _contextSnapshot: (_handle, snapshot) => snapshot,
        _scheduleRelease() {}, console });
      const source = read('main/pi-session/ipc.js');
      vm.runInContext(source.slice(source.indexOf('  async function sendConversation('), source.indexOf("  ipcMain.handle('pi-session-queue-cancel'")), main);
      ipcMain.handle('review-context-get', () => active.snapshot());
      const preload = path.join(root, 'preload.cjs');
      fs.writeFileSync(preload, "const{contextBridge,ipcRenderer}=require('electron');contextBridge.exposeInMainWorld('reviewNative',{send:(...a)=>ipcRenderer.invoke('pi-session-send',...a),snapshot:()=>ipcRenderer.invoke('review-context-get')});");
      const html = path.join(root, 'review.html');
      const styles = [...read('desk.html').matchAll(/<link\b[^>]*href=["']([^"']+\.css)["']/g)].map(match =>
        '<link rel="stylesheet" href="' + require('node:url').pathToFileURL(path.join(client, match[1])).href + '">').join('');
      fs.writeFileSync(html, '<!doctype html><meta charset="utf-8">' + styles + '<style>body{background:#fafafa}#composePanel{height:900px;display:block}#cpChat{display:block;height:100%}.nchat{height:100%}</style><main id="composePanel"><div id="cpChat"></div></main>');
      win = new BrowserWindow({ show: false, width: 1380, height: 1080, webPreferences: { contextIsolation: true, sandbox: true,
        offscreen: true, backgroundThrottling: false, preload } });
      win.webContents.session.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*'] }, (_request, done) => done({ cancel: true }));
      await win.loadFile(html);
      await require('./lib/conversation-send-harness.cjs').install(win, read);
      await js(read('core/requirement-review-context.js') + '\nvoid 0;');
      await js(`low.open=async()=>({ok:true,...runtimeSession,adapterId:'pi',model,snapshot:idle()});
        low.send=(...args)=>reviewNative.send(...args);low.snapshot=async()=>({ok:true,snapshot:{...await reviewNative.snapshot(),modelSelection:idle().modelSelection}});
        SoduWorkAPI.getAcceptanceContext=async()=>reviewContext;void 0;`);
      for (const mode of ['manual', 'auto']) for (const newest of ['supplement', 'rework']) {
        const id = mode + '-' + newest, context = await seed(id, newest, mode === 'manual' && newest === 'supplement');
        await open(context, mode);
        const start = calls.length, previous = captures.length, complete = completions.length;
        await click('#nchatSend');
        for (let i = 0; i < 300 && captures.length === previous; i++) await wait(30);
        assert.equal(captures.length, previous + 1, await js('JSON.stringify({errors,toasts,text:document.body.innerText})'));
        const result = await completions[complete]; assert.equal(result.ok, true, JSON.stringify(result));
        assert.equal(provider.requests.length, 1);
        const wire = JSON.stringify(provider.requests[0].messages.findLast(row => row.role === 'user').content);
        assert.match(captures.at(-1).promptText, /本轮验收人新增说明[^\n]*\nCheck spelling\. REVIEWER-NOTE-END/);
        for (const row of context.requirementTimeline.rows) assert.ok(wire.includes(row.text.replace(/\n/g, '\\n')), row.kind + ' full content must reach the provider');
        assert.match(wire, /真实记录时间最新/); assert.match(wire, /时间相同或未记录/); assert.match(wire, /REVIEWER-NOTE-END/);
        assert.match(wire, /criterion-1/); assert.match(wire, /被覆盖内容/);
        const posts = calls.slice(start).filter(row => row.method === 'POST');
        assert.equal(posts.filter(row => row.route.endsWith('/auto-review')).length, mode === 'auto' ? 1 : 0);
        assert.doesNotMatch(JSON.stringify(posts), /local:model-|acceptanceDraft|acceptanceInstruction|requirementTimeline"/);
        assert.equal(posts.some(row => row.route.endsWith('/conversation-turn')), false);
        const current = await request('/tasks/' + context.task.id + '/acceptance-context');
        assert.equal(current.canDecide, mode === 'manual');
        report.checks.push(mode + ': real chronological ' + newest + ' precedence, consumed rejection and complete history reach one actual SDK HTTP request; review metadata stays local');
        fs.writeFileSync(path.join(output, id + '.png'), (await win.webContents.capturePage()).toPNG());
      }
      const stale = await seed('stale-auto', 'supplement');
      await open(stale, 'auto'); triggerMutation = () => note(stale.task.id, 'Concurrent latest correction. CONCURRENT-END', 'concurrent');
      const completed = completions.length; await click('#nchatSend');
      for (let i = 0; i < 300 && completions.length === completed; i++) await wait(30);
      const failure = await completions[completed]; assert.equal(failure.ok, false);
      assert.match(failure.reason, /补充说明或退回意见/);
      assert.equal(calls.filter(row => row.route.endsWith('/stale-auto/auto-review')).at(-1).status, 409);
      assert.equal((await request('/tasks/stale-auto/acceptance-context')).canDecide, true);
      report.checks.push('A supplemental event committed during the provider response rejects the stale automatic report with real HTTP 409 and leaves approval pending');
      const fresh = await request('/tasks/stale-auto/acceptance-context');
      const prepared = await require('../main/pi-session/task-input').prepare(identity, fresh.task.id, active.sessionId, 'queued-review', 'Review current evidence',
        { acceptanceOnly: true }, { handle: active, identityOf: async () => identity });
      await note(fresh.task.id, 'New correction after queue admission. QUEUE-END', 'queued-change');
      await assert.rejects(prepared.beforeTurn(), /补充说明或退回意见/);
      report.checks.push('A real Hub timeline change after preparation blocks the queued review before model admission');
      for (let i = 0; i < 27; i++) await note(fresh.task.id, 'Full history ' + i + ': ' + 'x'.repeat(1850) + ' FINAL-' + i, 'budget-' + i);
      const before = provider.requests.length;
      await assert.rejects(require('../main/pi-session/task-input').prepare(identity, fresh.task.id, active.sessionId, 'over-budget', 'Review',
        { acceptanceOnly: true }, { handle: active }), /超过.*限制/);
      assert.equal(provider.requests.length, before);
      report.checks.push('More than 50,000 characters of authentic recorded instructions fail before inference instead of silently dropping the final correction');
      assert.deepEqual(await js('errors'), []);
      report.ok = true;
    } catch (error) { report.errors.push(error.stack || String(error)); }
    finally {
      try { await provider?.close(); } catch (error) { report.errors.push(String(error)); report.ok = false; }
      global.fetch = originalFetch;
      fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
      fs.writeFileSync(path.join(output, 'hub-requests.json'), JSON.stringify(calls, null, 2));
      fs.writeFileSync(path.join(output, 'runtime-prompts.json'), JSON.stringify(captures, null, 2));
      console.log(JSON.stringify({ ok: report.ok, checks: report.checks.length, output, errors: report.errors }));
      win?.destroy(); fs.rmSync(root, { recursive: true, force: true }); app.exit(report.ok ? 0 : 1);
    }
  });
}
