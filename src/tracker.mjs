import { projectId, projectRef } from './connection.mjs';

const MAX_BYTES = 2 * 1024 * 1024;
const MAX_PROJECTS = 500;
const MAX_COLUMNS = 100;
const MAX_ISSUES = 200;
const MAX_INITIATIVES = 100;

export class TrackerError extends Error {
  constructor(code) { super(code); this.code = code; }
}

function requireShape(ok) {
  if (!ok) throw new TrackerError('invalid_response');
}

async function readJson(response) {
  if (!response.body) throw new TrackerError('invalid_response');
  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8', { fatal: true });
  const chunks = [];
  let bytes = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_BYTES) throw new TrackerError('too_large');
      chunks.push(decoder.decode(value, { stream: true }));
    }
    chunks.push(decoder.decode());
    return JSON.parse(chunks.join(''));
  } catch (error) {
    await reader.cancel().catch(() => {});
    throw error;
  } finally {
    reader.releaseLock();
  }
}

export function tracker(base, key, { fetch: request = globalThis.fetch, deadline = () => AbortSignal.timeout(10_000) } = {}) {
  const text = (value, length = 256) => {
    requireShape(typeof value === 'string');
    // Treat a server reflecting its authenticated header as untrusted display data too.
    return value.replaceAll(key, '[redacted]').slice(0, length);
  };

  async function get(path, signal) {
    const timeout = deadline();
    const stop = AbortSignal.any([signal, timeout]);
    try {
      stop.throwIfAborted();
      const response = await request(base + path, {
        method: 'GET', headers: { accept: 'application/json', 'x-api-key': key }, redirect: 'error', signal: stop,
      });
      if (!response.ok) {
        await response.body?.cancel().catch(() => {});
        throw new TrackerError(
          response.status === 401 ? 'unauthorized' : response.status === 403 ? 'forbidden'
            : response.status === 404 ? 'not_found' : response.status === 429 ? 'rate_limited' : 'connection',
        );
      }
      const value = await readJson(response);
      stop.throwIfAborted();
      return value;
    } catch (error) {
      if (signal.aborted) throw new TrackerError('cancelled');
      if (timeout.aborted) throw new TrackerError('timeout');
      if (error instanceof TrackerError) throw error;
      throw new TrackerError(error instanceof SyntaxError ? 'invalid_response' : 'connection');
    }
  }

  return {
    async projects(signal) {
      const rows = await get('/projects', signal);
      requireShape(Array.isArray(rows));
      const projects = [];
      for (const row of rows.slice(0, MAX_PROJECTS)) {
        requireShape(projectId(row?.id) && projectId(row.teamId) && projectRef(row.ref));
        if (!row.ref.includes(key)) projects.push({
          id: row.id, teamId: row.teamId, ref: row.ref, team: text(row.teamName), name: text(row.name),
        });
      }
      return { projects, partial: rows.length >= MAX_PROJECTS };
    },

    async board({ id, teamId, ref }, signal) {
      if (!projectId(id) || !projectId(teamId) || !projectRef(ref) || ref.includes(key)) throw new TrackerError('invalid_project');
      // A mutable team slug is for display; the API also resolves refs by numeric team id.
      const route = `/projects/${teamId}${ref.slice(ref.indexOf('.'))}`;
      const rows = await get(`${route}/issues?limit=${MAX_ISSUES}`, signal);
      requireShape(Array.isArray(rows));
      const scaffold = await get(route, signal);
      if (scaffold?.project?.id !== id) throw new TrackerError('project_changed');
      requireShape(Array.isArray(scaffold.columns));
      if (scaffold.columns.length > MAX_COLUMNS) throw new TrackerError('too_large');
      const { groups, count } = groupIssues(scaffold.columns, rows.slice(0, MAX_ISSUES), text);
      let initiatives = null;
      if (scaffold.project.initiativesEnabled !== false) {
        try {
          const page = await get(`${route}/initiatives?status=active&pageSize=${MAX_INITIATIVES}`, signal);
          requireShape(Array.isArray(page?.items) && Number.isSafeInteger(page.total));
          requireShape(page.items.every((item) => item?.projectId === id));
          const items = page.items.slice(0, MAX_INITIATIVES).filter((item) => item.status === 'active').map((item) => {
            const { completed, total } = item.progress ?? {};
            requireShape(Number.isSafeInteger(completed) && Number.isSafeInteger(total) && completed >= 0 && completed <= total);
            return { title: text(item.title), completed, total };
          });
          initiatives = { items, partial: page.total > page.items.length || page.items.length > MAX_INITIATIVES };
        } catch (error) {
          if (signal.aborted) throw error;
          // Optional data must not hide a verified issue board.
        }
      }
      return { groups, count, initiatives, partial: rows.length >= MAX_ISSUES };
    },
  };
}

function groupIssues(columns, rows, text) {
  const order = new Map();
  for (const column of columns) {
    requireShape(projectId(column?.id) && Number.isFinite(column.position) && !order.has(column.id));
    order.set(column.id, {
      name: text(column.name), position: column.position, completed: column.stateType === 'completed', issues: [],
    });
  }
  const unknown = { name: 'Unknown column', issues: [] };
  const byId = new Map();
  const counts = new Map();
  for (const row of rows) {
    requireShape(projectId(row?.id) && !byId.has(row.id));
    const issue = { identifier: text(row.identifier, 64), title: text(row.title), position: row.position, progress: null };
    byId.set(row.id, issue);
    const group = order.get(row.columnId) ?? unknown;
    group.issues.push(issue);
    if (projectId(row.parentId)) {
      const count = counts.get(row.parentId) ?? { completed: 0, total: 0 };
      count.total++;
      if (group.completed) count.completed++;
      counts.set(row.parentId, count);
    }
  }
  for (const [id, progress] of counts) {
    const issue = byId.get(id);
    if (issue) issue.progress = progress;
  }
  const groups = [...order.values()].sort((a, b) => a.position - b.position);
  if (unknown.issues.length) groups.push(unknown);
  return {
    count: rows.length,
    groups: groups.map(({ name, issues }) => ({
      name,
      issues: (issues.every(({ position }) => Number.isFinite(position))
        ? issues.sort((a, b) => a.position - b.position) : issues).map(({ position, ...issue }) => issue),
    })),
  };
}
