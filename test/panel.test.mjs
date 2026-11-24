import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createPanel } from '../src/panel-state.mjs';

const base = 'https://plan.example.test';
const projects = [{ id: 1, ref: 'team.ONE' }, { id: 2, ref: 'team.TWO' }];
const ok = (value) => ({ ok: true, value });
const mapped = (mappedId) => ok({ token: `test-${mappedId}`, name: 'Repository', mappedId });
const catalog = (rows = projects) => ok({ projects: rows, partial: false });
const change = (workspaceId) => ({ context: { workspaceId } });

function harness(url = base) {
  const calls = [];
  const queue = [];
  const waiters = [];
  let state;
  let draftClears = 0;
  let draft = '';
  const panel = createPanel({
    readSetting: async () => url,
    request(name, input, { signal }) {
      const d = Promise.withResolvers();
      const call = { name, input, signal, finish: d.resolve };
      calls.push(call);
      if (waiters.length) waiters.shift()(call);
      else queue.push(call);
      return d.promise;
    },
    render: (value) => { state = { ...value }; },
    clearDraft: () => { draft = ''; draftClears++; },
  });
  return {
    panel, calls, setUrl: (next) => { url = next; },
    get state() { return state; },
    get draftClears() { return draftClears; },
    setDraft(value) { draft = value; },
    get draft() { return draft; },
    async next(name) {
      const call = queue.shift() ?? await new Promise((resolve) => waiters.push(resolve));
      assert.equal(call.name, name);
      return call;
    },
  };
}

async function start(h) {
  const open = h.panel.open();
  const focus = await h.next('focus.read');
  const list = await h.next('projects.list');
  return { open, focus, list };
}

test('key save recovers missing credentials', async () => {
  const h = harness();
  const { open, focus, list } = await start(h);
  focus.finish(ok(null));
  list.finish({ ok: false, code: 'missing_key' });
  await open;
  assert.equal(h.state.catalogStatus, 'missing_key');
  const count = h.draftClears;
  const saving = h.panel.saveKey('test-secret');
  const save = await h.next('connection.save');
  assert.equal(save.input.base, base);
  assert.ok(h.draftClears > count);
  save.finish(ok(null));
  (await h.next('focus.read')).finish(ok(null));
  (await h.next('projects.list')).finish(catalog());
  await saving;
  assert.deepEqual(h.state.catalog.projects, projects);
  assert.equal(h.state.catalogStatus, null);
});

test('a URL change invalidates a save completion and clears old data', async () => {
  const h = harness();
  const { open, focus, list } = await start(h);
  focus.finish(ok(null));
  list.finish(catalog());
  await open;
  const saving = h.panel.saveKey('test-secret');
  const oldSave = await h.next('connection.save');
  h.setUrl('https://other.example.test');
  const changed = h.panel.urlChanged();
  assert.equal(h.state.catalog, null);
  assert.equal(h.state.base, null);
  const changedFocus = await h.next('focus.read');
  const changedList = await h.next('projects.list');
  assert.equal(changedList.input.base, 'https://other.example.test');
  oldSave.finish(ok(null));
  await saving;
  assert.equal(h.calls.filter(({ name }) => name === 'projects.list').length, 2);
  changedFocus.finish(ok(null));
  changedList.finish({ ok: false, code: 'missing_key' });
  await changed;
  assert.equal(h.state.catalogStatus, 'missing_key');
});

test('editing the URL clears an unsent key before showing the new base', async () => {
  const h = harness();
  const { open, focus, list } = await start(h);
  focus.finish(ok(null));
  list.finish({ ok: false, code: 'missing_key' });
  await open;
  h.setDraft('test-key-for-old-address');
  h.setUrl('https://other.example.test');
  const changed = h.panel.urlChanged();
  assert.equal(h.draft, '');
  (await h.next('focus.read')).finish(ok(null));
  (await h.next('projects.list')).finish({ ok: false, code: 'missing_key' });
  await changed;
  assert.equal(h.state.base, 'https://other.example.test');
  assert.equal(h.draft, '');
  assert.ok(h.calls.every(({ name }) => name !== 'connection.save'));
});

test('closed panel cannot start tracker reads', async () => {
  const h = harness();
  const { open, focus, list } = await start(h);
  h.panel.close();
  assert.equal(list.signal.aborted, true);
  list.finish(catalog());
  focus.finish(mapped(1));
  await open;
  await h.panel.urlChanged();
  await h.panel.workspaceChanged(change('identity:other'));
  await h.panel.refresh();
  assert.deepEqual(h.calls.map(({ name }) => name), ['focus.read', 'projects.list']);
});

test('focus and project list complete in either order', async () => {
  for (const focusFirst of [true, false]) {
    const h = harness();
    const { open, focus, list } = await start(h);
    if (focusFirst) {
      focus.finish(mapped(1));
      await Promise.resolve();
      assert.equal(h.calls.length, 2);
      list.finish(catalog());
    } else {
      list.finish(catalog());
      await open;
      assert.equal(h.state.catalog.projects.length, 2);
      assert.equal(h.calls.length, 2);
      focus.finish(mapped(1));
    }
    const request = await h.next('board.read');
    assert.equal(request.input.project.id, 1);
    request.finish(ok('Current board'));
    await open;
    assert.equal(h.state.selected, 1);
  }
});

test('mapped focus supersedes stale board replies', async () => {
  const h = harness();
  const { open, focus, list } = await start(h);
  focus.finish(mapped(1));
  list.finish(catalog());
  const stale = await h.next('board.read');
  const changed = h.panel.workspaceChanged(change('identity:two'));
  const latestFocus = await h.next('focus.read');
  assert.equal(stale.signal.aborted, true);
  assert.equal(h.state.board, null);
  latestFocus.finish(mapped(2));
  const latest = await h.next('board.read');
  latest.finish(ok('New board'));
  await changed;
  stale.finish(ok('Stale board'));
  await open;
  assert.equal(h.state.selected, 2);
  assert.equal(h.state.board, 'New board');
});

test('a replacement project does not inherit a mapping', async () => {
  const h = harness();
  const { open, focus, list } = await start(h);
  focus.finish(mapped(1));
  list.finish(catalog([{ id: 3, ref: projects[0].ref }]));
  await open;
  assert.equal(h.state.selected, null);
  assert.equal(h.state.catalog.projects[0].id, 3);
  assert.equal(h.calls.length, 2);
});

test('manual selection wins a pending focus lookup', async () => {
  const h = harness();
  const { open, focus, list } = await start(h);
  list.finish(catalog());
  await open;
  const choosing = h.panel.pick(2);
  const read = await h.next('board.read');
  focus.finish(mapped(1));
  read.finish(ok('Manual board'));
  await choosing;
  assert.equal(h.state.selected, 2);
  assert.equal(h.state.board, 'Manual board');
  assert.equal(h.calls.length, 3);
});

test('refresh preserves a manual selection in the same focused workspace', async () => {
  const h = harness();
  const { open, focus, list } = await start(h);
  focus.finish(mapped(1));
  list.finish(catalog());
  (await h.next('board.read')).finish(ok('Mapped board'));
  await open;
  const choosing = h.panel.pick(2);
  (await h.next('board.read')).finish(ok('Manual board'));
  await choosing;

  const refreshing = h.panel.refresh();
  (await h.next('focus.read')).finish(mapped(1));
  (await h.next('projects.list')).finish(catalog());
  const request = await h.next('board.read');
  request.finish(ok('Refreshed board'));
  await refreshing;
  assert.equal(request.input.project.id, 2);
});

test('returning to a mapped workspace during refresh drops the manual override', async () => {
  const h = harness();
  await h.panel.workspaceChanged(change('identity:a'));
  const { open, focus, list } = await start(h);
  focus.finish(mapped(1));
  list.finish(catalog());
  (await h.next('board.read')).finish(ok('Remembered A'));
  await open;
  const choosing = h.panel.pick(2);
  (await h.next('board.read')).finish(ok('Manual B'));
  await choosing;

  const refreshing = h.panel.refresh();
  const refreshFocus = await h.next('focus.read');
  const pendingList = await h.next('projects.list');
  const away = h.panel.workspaceChanged(change('identity:b'));
  const awayFocus = await h.next('focus.read');
  const back = h.panel.workspaceChanged(change('identity:a'));
  const backFocus = await h.next('focus.read');
  backFocus.finish(mapped(1));
  await back;
  awayFocus.finish(mapped(2));
  await away;
  refreshFocus.finish(mapped(1));
  pendingList.finish(catalog());
  const board = await h.next('board.read');
  board.finish(ok('Remembered A again'));
  await refreshing;
  assert.equal(board.input.project.id, 1);
});

test('refresh retains a manual choice made before focus first resolves', async () => {
  const h = harness();
  await h.panel.workspaceChanged(change('identity:a'));
  const { open, focus, list } = await start(h);
  list.finish(catalog());
  await open;
  const choosing = h.panel.pick(2);
  (await h.next('board.read')).finish(ok('Manual B'));
  await choosing;

  const refreshing = h.panel.refresh();
  const refreshFocus = await h.next('focus.read');
  const pendingList = await h.next('projects.list');
  await h.panel.workspaceChanged(change('identity:a')); // Terminal change, not a new focus.
  focus.finish(mapped(1));
  pendingList.finish(catalog());
  await refreshing;
  refreshFocus.finish(mapped(1));
  const board = await h.next('board.read');
  board.finish(ok('Refreshed B'));
  assert.equal(board.input.project.id, 2);
});
