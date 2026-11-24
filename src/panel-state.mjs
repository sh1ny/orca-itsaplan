import { normalizeBase } from './connection.mjs';

export function createPanel({ readSetting, request, render, clearDraft }) {
  const state = {
    base: null, catalog: null, focus: null, selected: null, board: null,
    catalogStatus: 'loading', boardStatus: null, actionStatus: null, saving: false, mapping: false,
  };
  let disposed = false;
  let connectionGeneration = 0;
  let focusGeneration = 0;
  let manualGeneration = 0;
  let fallback = null;
  let preserveSelection = false;
  let focusPending = false;
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

  function reconcile() {
    if (state.catalog && !focusPending) {
      const mapped = state.focus?.mappedId;
      const keepSelection = preserveSelection && state.catalog.projects.some(({ id }) => id === fallback);
      preserveSelection = false;
      const hasMapping = state.catalog.projects.some(({ id }) => id === mapped);
      void board(keepSelection || !hasMapping ? fallback : mapped);
    }
  }

  async function focus() {
    if (disposed || !state.base) return;
    const current = ++focusGeneration;
    const manualAtStart = manualGeneration;
    const connection = connectionGeneration;
    fallback = state.selected ?? fallback;
    state.focus = null;
    state.mapping = false;
    state.selected = null;
    focusPending = true;
    clearBoard();
    draw();
    const result = await call('focus.read', { base: state.base });
    if (disposed || current !== focusGeneration || connection !== connectionGeneration) return;
    focusPending = false;
    state.focus = result.ok ? result.value : null;
    if (manualAtStart === manualGeneration) reconcile();
    draw();
  }

  async function refresh(reset = false) {
    if (disposed) return;
    const generation = ++connectionGeneration;
    const controller = new AbortController();
    catalogRequest?.abort();
    catalogRequest = controller;
    ++focusGeneration;
    focusPending = false;
    clearBoard();
    const oldBase = state.base;
    preserveSelection = !reset && state.selected !== null;
    fallback = reset ? null : (state.selected ?? fallback);
    Object.assign(state, {
      base: null, catalog: null, selected: null, focus: null, catalogStatus: 'loading',
      actionStatus: null, saving: false, mapping: false,
    });
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
    if (oldBase !== state.base) {
      preserveSelection = false;
      fallback = null;
    }
    if (!state.base) { state.catalogStatus = 'invalid_url'; draw(); return; }
    void focus();
    const result = await call('projects.list', { base: state.base }, { signal: controller.signal });
    if (generation !== connectionGeneration || disposed) return;
    state.catalogStatus = result.ok ? null : result.code;
    state.catalog = result.ok ? result.value : null;
    reconcile();
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
    if (result.ok) await refresh();
    else { state.actionStatus = result.code; draw(); }
  }

  return {
    open: () => refresh(true),
    refresh: () => refresh(),
    urlChanged: () => refresh(true),
    workspaceChanged({ context } = {}) {
      const next = context?.workspaceId;
      if (next && next === observedId) return;
      observedId = next;
      preserveSelection = false;
      return focus();
    },
    pick(id) {
      if (disposed || !state.catalog) return;
      ++manualGeneration;
      fallback = id;
      return board(id);
    },
    saveKey: (key) => credential('connection.save', key),
    clearKey: () => credential('connection.clear'),
    async remember() {
      const { selected: projectId, focus: match, base } = state;
      if (disposed || !projectId || !match || state.mapping) return;
      const generation = focusGeneration;
      state.mapping = true;
      state.actionStatus = null;
      draw();
      const result = await call('focus.save', { base, token: match.token, projectId });
      if (disposed || generation !== focusGeneration) return;
      state.mapping = false;
      if (result.ok) state.focus = { ...match, mappedId: projectId };
      else state.actionStatus = result.code;
      draw();
    },
    close() {
      disposed = true;
      catalogRequest?.abort();
      clearBoard();
      clearDraft();
    },
  };
}
