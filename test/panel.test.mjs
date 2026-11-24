import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createPanel } from '../src/panel-state.mjs';

const base = 'https://plan.example.test';
const projects = [{ id: 1, ref: 'team.ONE' }, { id: 2, ref: 'team.TWO' }];
const ok = (value) => ({ ok: true, value });
const focused = (token, eventId = `identity:${token}`) => ok({ token, eventId, name: `Workspace ${token}` });
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
  assert.equal(h.calls.filter(({ name }) => name === 'focus.read').length, 1);
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
  focus.finish(focused('a'));
  await open;
  await h.panel.urlChanged();
  await h.panel.workspaceChanged(change('identity:other'));
  await h.panel.refresh();
  assert.deepEqual(h.calls.map(({ name }) => name), ['focus.read', 'projects.list']);
});

async function openPicker(h, workspace = focused('a')) {
  const { open, focus, list } = await start(h);
  focus.finish(workspace);
  list.finish(catalog());
  await open;
}

async function pick(h, id) {
  const choosing = h.panel.pick(id);
  const read = await h.next('board.read');
  assert.equal(read.input.project.id, id);
  read.finish(ok(`Board ${id}`));
  await choosing;
}

test('switching workspaces clears the choice and does not remember it on return', async () => {
  const h = harness();
  await openPicker(h);
  const choosing = h.panel.pick(2);
  const stale = await h.next('board.read');
  const away = h.panel.workspaceChanged(change('identity:b'));
  assert.equal(stale.signal.aborted, true);
  assert.equal(h.state.selected, null);
  const awayRead = await h.next('focus.read');
  const back = h.panel.workspaceChanged(change('identity:a'));
  (await h.next('focus.read')).finish(focused('a'));
  await back;
  awayRead.finish(focused('b'));
  stale.finish(ok('Stale board'));
  await Promise.all([away, choosing]);
  assert.equal(h.state.focus.name, 'Workspace a');
  assert.equal(h.state.selected, null);
  assert.equal(h.state.board, null);
  assert.equal(h.calls.filter(({ name }) => name === 'board.read').length, 1);
});

test('refresh reloads the displayed board without reloading the picker', async () => {
  const h = harness();
  await openPicker(h);
  await pick(h, 2);
  const refresh = h.panel.refresh();
  (await h.next('focus.read')).finish(focused('a'));
  const board = await h.next('board.read');
  assert.equal(board.input.project.id, 2);
  board.finish(ok('Updated board'));
  await refresh;
  assert.equal(h.state.board, 'Updated board');
  assert.equal(h.calls.filter(({ name }) => name === 'projects.list').length, 1);
});

test('refresh does not reload the old board if the worker sees focus move first', async () => {
  const h = harness();
  await openPicker(h);
  await pick(h, 2);
  const refresh = h.panel.refresh();
  (await h.next('focus.read')).finish(focused('b'));
  (await h.next('projects.list')).finish(catalog());
  await refresh;
  assert.equal(h.state.selected, null);
  assert.equal(h.state.board, null);
  assert.equal(h.calls.filter(({ name }) => name === 'board.read').length, 1);
});

test('an ID-less event rechecks focus without discarding a choice in the same workspace', async () => {
  const h = harness();
  await openPicker(h, focused('a', null));
  await pick(h, 1);
  const refreshing = h.panel.refresh();
  const refreshRead = await h.next('focus.read');
  const terminalChanged = h.panel.workspaceChanged(change(undefined));
  (await h.next('focus.read')).finish(focused('a', null));
  await terminalChanged;
  refreshRead.finish(focused('a', null));
  const board = await h.next('board.read');
  assert.equal(board.input.project.id, 1);
  board.finish(ok('Updated board'));
  await refreshing;
  assert.equal(h.state.board, 'Updated board');

  const switched = h.panel.workspaceChanged(change(undefined));
  (await h.next('focus.read')).finish(focused('b', null));
  await switched;
  assert.equal(h.state.selected, null);
  assert.equal(h.state.board, null);
});

test('no workspace identity still permits manual selection and catalog refresh', async () => {
  const h = harness();
  const { open, focus, list } = await start(h);
  list.finish(catalog());
  await open;
  assert.equal(h.state.checkingFocus, true);
  await h.panel.pick(2);
  assert.equal(h.calls.length, 2);
  const recheck = h.panel.workspaceChanged(change(undefined));
  (await h.next('focus.read')).finish(ok(null));
  focus.finish(ok(null));
  await recheck;
  await pick(h, 2);
  assert.equal(h.state.board, 'Board 2');
  await h.panel.pick(null);
  const refreshing = h.panel.refresh();
  (await h.next('projects.list')).finish(catalog([projects[0]]));
  await refreshing;
  assert.deepEqual(h.state.catalog.projects, [projects[0]]);
});
