import { createHash, createHmac, randomBytes } from 'node:crypto';
import { normalizeBase, projectId, URL_SETTING } from './connection.mjs';
import { tracker, TrackerError } from './tracker.mjs';

const SECRET = 'connection';
const fail = (code) => { throw new TrackerError(code); };
const digest = (parts) => createHash('sha256').update(JSON.stringify(parts)).digest('hex');
const validKey = (key) => typeof key === 'string' && /^[!-~]{1,4096}$/.test(key);

function readLane() {
  let active;
  let pending;

  async function next() {
    if (active || !pending) return;
    const job = pending;
    pending = undefined;
    active = job;
    try {
      if (job.signal.aborted) fail('cancelled');
      const value = await job.run(job.signal);
      if (job.signal.aborted) fail('cancelled');
      job.resolve(value);
    } catch (error) {
      job.reject(error);
    } finally {
      active = undefined;
      void next();
    }
  }

  return (kind, { panel, signal }, run) => new Promise((resolve, reject) => {
    if (panel?.surface !== 'panel' || !panel.id || !signal || signal.aborted) fail('cancelled');
    const id = panel.id;
    if (pending?.signal.aborted) {
      pending.reject(new TrackerError('cancelled'));
      pending = undefined;
    }
    if ((pending && pending.id !== id) || (kind === 'board' && [active, pending].some(
      (job) => job?.id === id && job.kind === 'projects' && !job.signal.aborted,
    ))) fail('busy');
    if (pending) pending.reject(new TrackerError('cancelled'));
    const controller = new AbortController();
    pending = { id, kind, controller, signal: AbortSignal.any([signal, controller.signal]), run, resolve, reject };
    if (active?.id === id) active.controller.abort();
    void next();
  });
}

export default function activate(orca, requestOptions) {
  const read = readLane();
  const witnessKey = randomBytes(32);
  const witnessFor = (panel) => createHmac('sha256', witnessKey).update(panel.id).digest('hex');
  function requireFrame(input, { panel, signal }) {
    if (panel?.surface !== 'panel' || !panel.id || !signal || signal.aborted) fail('cancelled');
    if (input?.witness !== witnessFor(panel)) fail('frame_required');
  }
  const register = (name, handler) => orca.panels.handle(name, async (input, context) => {
    try { return { ok: true, value: await handler(input, context) }; }
    catch (error) { return { ok: false, code: error instanceof TrackerError ? error.code : 'host' }; }
  });

  async function base(expected) {
    const value = normalizeBase(await orca.settings.get(URL_SETTING));
    if (!value) fail('invalid_url');
    if (value !== expected) fail('url_changed');
    return value;
  }

  async function pairedTracker(expected) {
    const url = await base(expected);
    let raw;
    try { raw = await orca.secrets.get(SECRET); } catch { fail('secret_unavailable'); }
    let saved;
    if (raw) {
      try { saved = JSON.parse(raw); } catch { fail('missing_key'); }
    }
    if (saved?.url !== url || !validKey(saved.key)) fail('missing_key');
    return tracker(url, saved.key, requestOptions);
  }

  async function scope(url) {
    const context = await orca.host.call('workspace.readContext');
    if (!context?.workspaceId) return null;
    const { workspaces } = await orca.host.call('workspace.list');
    const rows = workspaces.filter(({ id }) => id === context.workspaceId);
    if (rows.length !== 1) return null;
    const { id, hostId, projectId: repo, kind, project } = rows[0];
    if (kind !== 'worktree' || !hostId?.trim() || !repo?.trim()) return null;
    return { token: digest([url, id, hostId, repo]), key: `mapping-${digest([url, hostId, repo])}`, name: project || 'this Orca project' };
  }

  register('connection.save', async (input) => {
    const url = await base(input?.base);
    if (!validKey(input?.key)) fail('invalid_key');
    try { await orca.secrets.set(SECRET, JSON.stringify({ url, key: input.key })); }
    catch { fail('secret_unavailable'); }
    return null;
  });

  register('connection.clear', async (input) => {
    await base(input?.base);
    try { await orca.secrets.delete(SECRET); } catch { fail('secret_unavailable'); }
    return null;
  });

  register('sidebar.challenge', (_, { panel, signal }) => {
    if (panel?.surface !== 'panel' || !panel.id || signal?.aborted) fail('cancelled');
    // Direct dev requests can claim a panel id, but only an attached frame gets this push.
    orca.panels.post('sidebar.witness', { witness: witnessFor(panel) }, { panel: panel.id });
    return null;
  });

  register('projects.list', (input, context) => {
    requireFrame(input, context);
    return read('projects', context, async (signal) => (await pairedTracker(input.base)).projects(signal));
  });
  register('board.read', (input, context) => {
    requireFrame(input, context);
    return read('board', context, async (signal) => (await pairedTracker(input.base)).board(input.project ?? {}, signal));
  });

  register('focus.read', async (input) => {
    const match = await scope(await base(input?.base));
    if (!match) return null;
    const saved = await orca.storage.get(match.key);
    return { token: match.token, name: match.name, mappedId: projectId(saved) ? saved : null };
  });

  register('focus.save', async (input) => {
    if (!projectId(input?.projectId)) fail('invalid_project');
    const url = await base(input?.base);
    const match = await scope(url);
    if (!match || match.token !== input.token) fail('focus_changed');
    await base(url);
    await orca.storage.set(match.key, input.projectId);
    return null;
  });
}
