import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createPanel } from '../src/panel-state.mjs';

const base = 'https://plan.example.test';
const projects = [{ id: 1, ref: 'team.ONE' }, { id: 2, ref: 'team.TWO' }];
const ok = (value) => ({ ok: true, value });
const catalog = (rows = projects) => ok({ projects: rows, partial: false });

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
  const focus = await h.next('workspace.snapshot');
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
  assert.equal(h.calls.filter(({ name }) => name === 'workspace.snapshot').length, 1);
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
  const changedList = await h.next('projects.list');
  assert.equal(changedList.input.base, 'https://other.example.test');
  oldSave.finish(ok(null));
  await saving;
  assert.equal(h.calls.filter(({ name }) => name === 'projects.list').length, 2);
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
  focus.finish(ok('team.ONE'));
  await open;
  await h.panel.urlChanged();
  await h.panel.refresh();
  assert.deepEqual(h.calls.map(({ name }) => name), ['workspace.snapshot', 'projects.list']);
});

async function finishBoard(h, id, content) {
  const request = await h.next('board.read');
  assert.equal(request.input.project.id, id);
  request.finish(ok(content));
  return request;
}

async function openProject(h) {
  const { open, focus, list } = await start(h);
  focus.finish(ok('team.ONE'));
  list.finish(catalog());
  await finishBoard(h, 1, 'Workspace board');
  await open;
}

async function refresh(h, workspace) {
  const done = h.panel.refresh();
  const snapshot = await h.next('workspace.snapshot');
  const list = await h.next('projects.list');
  snapshot.finish(workspace);
  list.finish(catalog());
  return { done };
}

test('opening shows an exact workspace project after both reads complete', async () => {
  for (const workspaceFirst of [false, true]) {
    const h = harness();
    const { open, focus, list } = await start(h);
    if (workspaceFirst) focus.finish(ok('team.ONE'));
    else list.finish(catalog());
    assert.equal(h.state.board, null);
    if (workspaceFirst) list.finish(catalog());
    else focus.finish(ok('team.ONE'));
    await finishBoard(h, 1, 'Workspace board');
    await open;
    assert.equal(h.state.workspace, 'team.ONE');
    assert.equal(h.state.board, 'Workspace board');
    assert.equal(h.calls.filter(({ name }) => name === 'workspace.snapshot').length, 1);
  }
});

test('a successful Refresh replaces a hand pick with the freshly resolved workspace project', async () => {
  const h = harness();
  await openProject(h);
  const chosen = h.panel.pick(2);
  await finishBoard(h, 2, 'Hand pick');
  await chosen;
  assert.equal(h.state.board, 'Hand pick');
  assert.equal(h.calls.filter(({ name }) => name === 'workspace.snapshot').length, 1);

  const { done } = await refresh(h, ok('team.ONE'));
  await finishBoard(h, 1, 'Refreshed workspace board');
  await done;
  assert.equal(h.state.selected, 1);
  assert.equal(h.state.board, 'Refreshed workspace board');

  const { done: switched } = await refresh(h, ok('team.TWO'));
  await finishBoard(h, 2, 'Other workspace board');
  await switched;
  assert.equal(h.state.workspace, 'team.TWO');
  assert.equal(h.state.board, 'Other workspace board');
});

test('failed workspace check retains a hand pick as manual and ignores the old board reply', async () => {
  const h = harness();
  await openProject(h);
  const choosing = h.panel.pick(2);
  const oldRead = await h.next('board.read');
  const { done } = await refresh(h, { ok: false, code: 'host' });
  assert.equal(oldRead.signal.aborted, true);
  assert.equal(h.state.workspace, null);
  assert.equal(h.state.board, null);
  await finishBoard(h, 2, 'New manual board');
  await done;
  oldRead.finish(ok('Stale board'));
  await choosing;
  assert.equal(h.state.workspace, null);
  assert.equal(h.state.selected, 2);
  assert.equal(h.state.board, 'New manual board');
});

test('failed workspace check never refreshes the previous automatic board', async () => {
  const h = harness();
  await openProject(h);
  const { done } = await refresh(h, { ok: false, code: 'host' });
  await done;
  assert.equal(h.state.workspace, null);
  assert.equal(h.state.selected, null);
  assert.equal(h.state.board, null);
  assert.equal(h.calls.filter(({ name }) => name === 'board.read').length, 1);
  const picking = h.panel.pick(2);
  await finishBoard(h, 2, 'Manual board after failure');
  await picking;
  assert.equal(h.state.board, 'Manual board after failure');
});

test('an unmatched workspace name does not guess a tracker project', async () => {
  const h = harness();
  const { open, focus, list } = await start(h);
  focus.finish(ok('ONE'));
  list.finish(catalog());
  await open;
  assert.equal(h.state.workspace, 'ONE');
  assert.equal(h.state.selected, null);
  assert.deepEqual(h.state.catalog.projects, projects);
  assert.equal(h.calls.length, 2);
});
