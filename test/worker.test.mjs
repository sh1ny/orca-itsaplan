import assert from 'node:assert/strict';
import { test } from 'node:test';
import activate from '../src/worker.mjs';

const base = 'https://plan.example.test/prefix';
const other = 'https://other.example.test';
const key = 'test-opaque-credential';
const selected = { id: 8, teamId: 10, ref: 'alpha.ENG' };
const project = (id, ref) => ({ id, teamId: id + 2, ref, teamName: ref.split('.')[0], name: 'Engineering' });
const column = (id, name, position, stateType) => ({ id, name, position, stateType });
const issue = (id, columnId, parentId = null) => ({ id, columnId, parentId, title: `Work ${id}`, identifier: `ENG-${id}`, position: id });
const initiative = { projectId: 8, title: 'Ship', status: 'active', progress: { completed: 2, total: 5 } };
const scaffold = (id = 8, initiativesEnabled = true) => ({
  project: { id, initiativesEnabled }, columns: [column(2, 'Done', 2, 'completed'), column(1, 'Open', 1, 'started')],
});
const json = (value, status = 200) => new Response(JSON.stringify(value), { status });

function harness(fetch, configure = {}) {
  let url = base;
  let secret = configure.secret === null ? null : JSON.stringify({ url, key });
  let focused = null;
  const handlers = new Map();
  const witnesses = new Map();
  const calls = [];
  activate({
    settings: { get: async () => url },
    secrets: {
      get: async () => secret,
      set: async (_, value) => { if (configure.beforeStore) await configure.beforeStore(); secret = value; },
      delete: async () => { secret = null; },
    },
    host: { call: async (method) => {
      assert.equal(method, 'workspace.readContext');
      return focused;
    } },
    panels: {
      handle: (name, handler) => handlers.set(name, handler),
      post: (name, { witness }, { panel }) => {
        if (name === 'sidebar.witness' && !panel.startsWith('orca-cli')) witnesses.set(panel, witness);
      },
    },
  }, { deadline: configure.deadline, fetch: (uri, options) => { calls.push(uri); return fetch(uri, options); } });
  const request = (name, data, panel, signal) => handlers.get(name)(
    { base, ...data }, { panel: panel && { id: panel, surface: 'panel' }, signal },
  );
  function run(name, data = {}, panel = 'a', signal = new AbortController().signal) {
    if (panel && (name === 'projects.list' || name === 'board.read') && !witnesses.has(panel)) {
      void request('sidebar.challenge', {}, panel, signal);
    }
    return request(name, { witness: witnesses.get(panel), ...data }, panel, signal);
  }
  return {
    calls,
    setUrl: (value) => { url = value; },
    workspace: (value) => { focused = value; },
    run,
    request: (name, data, panel) => request(name, data, panel, new AbortController().signal),
    board: (data = selected, panel, signal) => run('board.read', { project: { teamId: data.id + 2, ...data } }, panel, signal),
  };
}

function boardResponses(url, rows, details = scaffold(), initiatives = { items: [initiative], total: 1 }) {
  if (url.includes('/issues?')) return json(rows);
  if (url.includes('/initiatives?')) return initiatives instanceof Response ? initiatives : json(initiatives);
  return json(details);
}

test('refuses unpaired credentials without a GET', async () => {
  const h = harness(() => assert.fail('unpaired request reached transport'));
  h.setUrl(other);
  assert.deepEqual(await h.run('projects.list', { base: other }), { ok: false, code: 'missing_key' });
  h.setUrl('http://plan.example.test');
  assert.equal((await h.run('projects.list')).code, 'invalid_url');
  assert.deepEqual(h.calls, []);
});

test('URL edits cannot rebind a pending key', async () => {
  const entered = Promise.withResolvers();
  const release = Promise.withResolvers();
  const h = harness(() => assert.fail('old key sent to new URL'), {
    secret: null, beforeStore: () => { entered.resolve(); return release.promise; },
  });
  const saving = h.run('connection.save', { key });
  await entered.promise;
  h.setUrl(other);
  release.resolve();
  assert.deepEqual(await saving, { ok: true, value: null });
  assert.equal((await h.run('projects.list', { base: other })).code, 'missing_key');
  assert.equal((await h.run('connection.save', { key })).code, 'url_changed');
  assert.deepEqual(h.calls, []);
});

test('keeps proxy path and refuses redirects', async () => {
  const h = harness((url, options) => {
    assert.equal(url, `${base}/projects`);
    assert.equal(options.method, 'GET');
    assert.equal(options.headers['x-api-key'], key);
    if (options.redirect !== 'error') return json([project(8, 'alpha.ENG')]);
    return Promise.reject(new TypeError('redirect refused'));
  });
  assert.deepEqual(await h.run('projects.list'), { ok: false, code: 'connection' });
  assert.deepEqual(h.calls, [`${base}/projects`]);
  assert.equal((await h.board({ id: 8, ref: '../stolen/path' })).code, 'invalid_project');
});

test('bounds decoded bytes and slow bodies', async () => {
  const huge = harness(() => new Response(new Uint8Array(2 * 1024 * 1024 + 1)));
  assert.equal((await huge.run('projects.list')).code, 'too_large');
  const started = Promise.withResolvers();
  const clock = new AbortController();
  const slow = harness((_, { signal }) => new Response(new ReadableStream({
    start(controller) { signal.addEventListener('abort', () => controller.error(signal.reason), { once: true }); },
    pull() { started.resolve(); },
  })), { deadline: () => clock.signal });
  const reading = slow.run('projects.list');
  await started.promise;
  clock.abort();
  assert.equal((await reading).code, 'timeout');
});

test('coalesces superseded selections', async () => {
  const first = Promise.withResolvers();
  const started = Promise.withResolvers();
  const h = harness((url) => {
    if (url.includes('/10.ENG/')) { started.resolve(); return first.promise; }
    return url.includes('/issues?') ? json([]) : json(scaffold(10, false));
  });
  const a = h.board();
  await started.promise;
  const b = h.board({ id: 9, ref: 'beta.ENG' });
  const c = h.board({ id: 10, ref: 'gamma.ENG' });
  assert.equal((await b).code, 'cancelled');
  assert.equal(h.calls.length, 1);
  first.resolve(json([]));
  assert.equal((await a).code, 'cancelled');
  assert.equal((await c).ok, true);
  assert.ok(h.calls.every((url) => !url.includes('/11.ENG')));
});

test("preserves another panel's request", async () => {
  const start = Promise.withResolvers();
  const first = Promise.withResolvers();
  let number = 0;
  const h = harness((_, { signal }) => {
    if (number++ === 0) { start.resolve(signal); return first.promise; }
    return json([]);
  });
  const a = h.run('projects.list', {}, 'a');
  const signal = await start.promise;
  const b = h.run('projects.list', {}, 'b');
  assert.equal((await h.run('projects.list', {}, 'c')).code, 'busy');
  assert.equal(signal.aborted, false);
  first.resolve(json([]));
  assert.equal((await a).ok, true);
  assert.equal((await b).ok, true);
});

test('preserves qualified projects from different teams', async () => {
  const h = harness(() => json([project(8, 'alpha.ENG'), { ...project(9, 'beta.7XTR'), name: key }]));
  assert.deepEqual((await h.run('projects.list')).value, { projects: [
    { id: 8, teamId: 10, team: 'alpha', name: 'Engineering', ref: 'alpha.ENG' },
    { id: 9, teamId: 11, team: 'beta', name: '[redacted]', ref: 'beta.7XTR' },
  ], partial: false });
  assert.equal((await h.run('projects.list', {}, null)).code, 'cancelled');
  assert.equal(h.calls.length, 1);
});

test('synthetic dev caller cannot start a read without a live-frame witness', async () => {
  const h = harness(() => assert.fail('detached caller reached transport'));
  assert.deepEqual(await h.request('sidebar.challenge', {}, 'orca-cli'), { ok: true, value: null });
  assert.equal((await h.request('projects.list', {}, 'orca-cli')).code, 'frame_required');
  assert.equal((await h.request('board.read', { project: selected }, 'a')).code, 'frame_required');
  assert.deepEqual(h.calls, []);
});

test('loads distinct boards for the same project key in two teams', async () => {
  const h = harness((url) => {
    if (url.endsWith('/projects')) return json([project(8, 'alpha.ENG'), project(9, 'beta.ENG')]);
    const id = url.includes('/10.ENG') ? 8 : 9;
    return boardResponses(url, [issue(id, 1)], scaffold(id, false));
  });
  const { value: { projects } } = await h.run('projects.list');
  for (const entry of projects) {
    const { value } = await h.board(entry);
    assert.equal(value.groups[0].issues[0].identifier, `ENG-${entry.id}`);
  }
  assert.deepEqual(h.calls, [
    `${base}/projects`, `${base}/projects/10.ENG/issues?limit=200`, `${base}/projects/10.ENG`,
    `${base}/projects/11.ENG/issues?limit=200`, `${base}/projects/11.ENG`,
  ]);
});

test('an invalid URL does not prevent clearing a stored key', async () => {
  const h = harness(() => assert.fail('cleared key reached transport'));
  h.setUrl('');
  assert.equal((await h.run('connection.clear')).code, 'url_changed');
  assert.equal((await h.run('connection.clear', { base: null })).ok, true);
  h.setUrl(base);
  assert.equal((await h.run('projects.list')).code, 'missing_key');
  assert.deepEqual(h.calls, []);
});

test('projects only bounded board data and counts listed children', async () => {
  const rows = [issue(6, 2, 4), issue(5, 1, 4), { ...issue(4, 1), description: key }];
  const h = harness((url) => boardResponses(url, rows));
  assert.deepEqual((await h.board()).value, {
    groups: [
      { name: 'Open', issues: [
        { identifier: 'ENG-4', title: 'Work 4', progress: { completed: 1, total: 2 } },
        { identifier: 'ENG-5', title: 'Work 5', progress: null },
      ] },
      { name: 'Done', issues: [{ identifier: 'ENG-6', title: 'Work 6', progress: null }] },
    ], count: 3, initiatives: { items: [{ title: 'Ship', completed: 2, total: 5 }], partial: false }, partial: false,
  });
  assert.equal(h.calls.length, 3);
});

test('keeps tracker issue order when lightweight rows omit positions', async () => {
  const rows = [issue(6, 1), { ...issue(4, 1), position: undefined }, issue(5, 1)];
  const h = harness((url) => boardResponses(url, rows, scaffold(8, false)));
  assert.deepEqual((await h.board()).value.groups[0].issues.map(({ identifier }) => identifier),
    ['ENG-6', 'ENG-4', 'ENG-5']);
});

test('optional initiatives do not hide unknown-column issues', async () => {
  for (const [enabled, page] of [[true, json({}, 403)], [false, null], [true, { items: [{ ...initiative, projectId: 9 }], total: 1 }]]) {
    const h = harness((url) => boardResponses(url, [issue(4, 99)], scaffold(8, enabled), page));
    const { value } = await h.board();
    assert.equal(value.initiatives, null);
    assert.equal(value.groups.at(-1).name, 'Unknown column');
    assert.equal(value.groups.at(-1).issues[0].identifier, 'ENG-4');
    assert.equal(h.calls.length, enabled ? 3 : 2);
  }
});

test('reports partial board and catalog results', async () => {
  const h = harness((url) => url.endsWith('/projects')
    ? json(Array.from({ length: 550 }, (_, i) => project(i + 1, `team${i}.ENG`)))
    : boardResponses(url, Array.from({ length: 210 }, (_, i) => issue(i + 1, 1)), scaffold(), { items: [initiative], total: 12 }));
  const list = (await h.run('projects.list')).value;
  const board = (await h.board()).value;
  assert.equal(list.projects.length, 500);
  assert.equal(list.partial, true);
  assert.equal(board.count, 200);
  assert.equal(board.partial, true);
  assert.equal(board.initiatives.partial, true);
});

test('rejects replacement scaffold after issue read', async () => {
  const h = harness((url) => boardResponses(url, [issue(4, 1)], scaffold(9)));
  assert.deepEqual(await h.board(), { ok: false, code: 'project_changed' });
  assert.deepEqual(h.calls, [`${base}/projects/10.ENG/issues?limit=200`, `${base}/projects/10.ENG`]);
});

test('projects raw workspace identities as distinct opaque focus tokens', async () => {
  const h = harness(() => assert.fail('focus must not start a tracker GET'));
  assert.deepEqual(await h.run('focus.read'), { ok: true, value: null });
  h.workspace({ workspaceId: 'repo::/private/wsl/branch', displayName: 'Same name' });
  const { value: first } = await h.run('focus.read');
  h.workspace({ workspaceId: 'repo::/private/ssh/branch', displayName: 'Same name' });
  const { value: second } = await h.run('focus.read');
  assert.equal(first.name, second.name);
  assert.equal(first.eventId, null);
  assert.match(first.token, /^[0-9a-f]{64}$/);
  assert.notEqual(first.token, second.token);
  h.workspace({ workspaceId: 'identity:one', displayName: 'Named workspace' });
  assert.equal((await h.run('focus.read')).value.eventId, 'identity:one');
});
