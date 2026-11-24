import { normalizeBase } from './connection.mjs';

export function createPanel({ readSetting, request, render, clearDraft }) {
  const state = {
    base: null, catalog: null, workspace: null, selected: null, board: null,
    catalogStatus: 'loading', boardStatus: null, actionStatus: null, saving: false, checkingWorkspace: false,
  };
  let disposed = false;
  let connectionGeneration = 0;
  let manualChoice;
  let catalogRequest;
  let boardRequest;
  const draw = () => { if (!disposed) render(state); };

  async function call(name, input, options) {
    try { return await request(name, input, { timeoutMs: 90_000, ...options }); }
    catch { return { ok: false, code: 'host' }; }
  }

  function clearBoard() {
    boardRequest?.abort();
    boardRequest = undefined;
    state.board = null;
    state.boardStatus = null;
  }

  async function board(id) {
    clearBoard();
    const project = state.catalog?.projects.find((item) => item.id === id);
    state.selected = project?.id ?? null;
    if (!project) { draw(); return; }
    const controller = new AbortController();
    boardRequest = controller;
    state.boardStatus = 'loading';
    draw();
    const result = await call('board.read', { base: state.base, project }, { signal: controller.signal });
    if (disposed || boardRequest !== controller) return;
    state.boardStatus = result.ok ? null : result.code;
    state.board = result.ok ? result.value : null;
    draw();
  }

  function reconcile() {
    if (state.checkingWorkspace || !state.catalog) return;
    if (manualChoice !== undefined) return board(manualChoice);
    const matches = state.catalog.projects.filter(({ ref }) => ref === state.workspace);
    return board(matches.length === 1 ? matches[0].id : null);
  }

  async function checkWorkspace() {
    state.checkingWorkspace = true;
    state.workspace = null;
    state.selected = null;
    clearBoard();
    draw();
    const result = await call('workspace.snapshot', null, { timeoutMs: 5_000 });
    if (disposed) return;
    state.checkingWorkspace = false;
    if (result.ok && result.value) {
      state.workspace = result.value;
      manualChoice = undefined;
    }
    draw();
    return reconcile();
  }

  async function reload() {
    await Promise.all([checkWorkspace(), loadCatalog()]);
  }

  async function loadCatalog() {
    if (disposed) return;
    const generation = ++connectionGeneration;
    const controller = new AbortController();
    catalogRequest?.abort();
    catalogRequest = controller;
    state.selected = null;
    clearBoard();
    Object.assign(state, { base: null, catalog: null, catalogStatus: 'loading', actionStatus: null, saving: false });
    clearDraft();
    draw();
    let value;
    try { value = await readSetting(); }
    catch {
      if (generation === connectionGeneration && !disposed) { state.catalogStatus = 'host'; draw(); }
      return;
    }
    if (generation !== connectionGeneration || disposed) return;
    state.base = normalizeBase(value);
    if (!state.base) { state.catalogStatus = 'invalid_url'; draw(); return; }
    const result = await call('projects.list', { base: state.base }, { signal: controller.signal });
    if (generation !== connectionGeneration || disposed) return;
    state.catalogStatus = result.ok ? null : result.code;
    state.catalog = result.ok ? result.value : null;
    draw();
    return reconcile();
  }

  async function credential(method, key) {
    if (disposed || state.saving || (method === 'connection.save' && !state.base)) return;
    const generation = connectionGeneration;
    const input = { base: state.base };
    if (method === 'connection.save') input.key = key;
    state.saving = true;
    state.actionStatus = null;
    clearDraft();
    draw();
    const result = await call(method, input);
    if (generation !== connectionGeneration || disposed) return;
    state.saving = false;
    if (result.ok) await loadCatalog();
    else { state.actionStatus = result.code; draw(); }
  }

  return {
    open() {
      if (disposed) return;
      return reload();
    },
    refresh() {
      if (disposed || state.saving || state.checkingWorkspace || state.catalogStatus === 'loading') return;
      return reload();
    },
    urlChanged() {
      manualChoice = undefined;
      return loadCatalog();
    },
    pick(id) {
      if (disposed || !state.catalog || state.checkingWorkspace) return;
      manualChoice = id;
      return board(id);
    },
    saveKey: (key) => credential('connection.save', key),
    clearKey: () => credential('connection.clear'),
    close() {
      disposed = true;
      catalogRequest?.abort();
      clearBoard();
      clearDraft();
    },
  };
}
