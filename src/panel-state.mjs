import { normalizeBase } from './connection.mjs';

export function createPanel({ readSetting, request, render, clearDraft }) {
  const state = {
    base: null, catalog: null, focus: null, selected: null, board: null,
    catalogStatus: 'loading', boardStatus: null, actionStatus: null, saving: false, checkingFocus: false,
  };
  let disposed = false;
  let connectionGeneration = 0;
  let focusRead;
  let observedId;
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

  function clearSelection() {
    state.selected = null;
    clearBoard();
  }

  function followFocus() {
    if (disposed) return;
    state.checkingFocus = true;
    const read = (async () => {
      const result = await call('focus.read', null, { timeoutMs: 5_000 });
      if (disposed || focusRead !== read) return;
      state.checkingFocus = false;
      if (result.ok) {
        const next = result.value;
        if ((state.focus?.token ?? null) !== (next?.token ?? null)) clearSelection();
        state.focus = next;
        observedId = next?.eventId ?? null;
      }
      draw();
    })();
    focusRead = read;
    draw();
    return read;
  }

  async function refresh() {
    if (disposed || state.saving || state.catalogStatus === 'loading') return;
    const connection = connectionGeneration;
    if (state.selected !== null) {
      // Context may change before Orca delivers the debounced event.
      let current = followFocus();
      while (current) {
        await current;
        if (disposed || connection !== connectionGeneration) return;
        if (current === focusRead) break;
        current = focusRead;
      }
      if (state.selected !== null) return board(state.selected);
    }
    return loadCatalog();
  }

  async function loadCatalog() {
    if (disposed) return;
    const generation = ++connectionGeneration;
    const controller = new AbortController();
    catalogRequest?.abort();
    catalogRequest = controller;
    clearSelection();
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
      if (!focusRead) void followFocus();
      return loadCatalog();
    },
    refresh,
    urlChanged: loadCatalog,
    workspaceChanged({ context } = {}) {
      if (disposed) return;
      const next = context?.workspaceId;
      if (next && next === observedId) return;
      if ((next && observedId) || (context === null && state.focus?.token)) clearSelection();
      if (next) observedId = next;
      return followFocus();
    },
    pick(id) {
      if (disposed || !state.catalog || state.checkingFocus) return;
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
