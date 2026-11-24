import { URL_SETTING } from './connection.mjs';
import { createPanel } from './panel-state.mjs';

const find = (id) => document.getElementById(id);
const refresh = find('refresh');
const connectionStatus = find('connection-status');
const credentials = find('credentials');
const key = find('key');
const picker = find('picker');
const select = find('project');
const remember = find('remember');
const board = find('board');
const messages = {
  loading: 'Loading…', busy: 'Another panel is reading. Try Refresh.',
  cancelled: 'Read cancelled. Try Refresh.', host: 'Orca could not complete the request. Try Refresh.',
  invalid_url: 'Set the HTTPS API URL in Settings → Plugins → It’s a Plan.',
  url_changed: 'The API URL changed. Refresh and enter the key for the displayed address.',
  missing_key: 'Enter an API key for this address in Connection.',
  invalid_key: 'Enter a valid API key without spaces or line breaks.',
  secret_unavailable: 'Orca could not access its encrypted secret store. Check the OS keyring.',
  unauthorized: 'Itsaplan rejected the API key. Verify or replace it.',
  forbidden: 'The API key does not have permission to read this data.',
  not_found: 'The API or project was not found. Check the API URL or refresh projects.',
  rate_limited: 'Itsaplan is rate limiting requests. Try again later.',
  connection: 'Could not reach the Itsaplan HTTPS API. Check its address, certificate and redirects.',
  timeout: 'Itsaplan did not respond in time. Try Refresh.',
  too_large: 'The tracker response exceeded this panel’s size limit.',
  invalid_response: 'Itsaplan sent a response this panel does not recognize.',
  project_changed: 'This route now identifies a different project. Refresh the project list.',
  invalid_project: 'This project is no longer selectable. Refresh the project list.',
  focus_changed: 'The focused Orca project changed. Try again in the correct workspace.',
};

function message(node, text) {
  node.textContent = text;
  node.hidden = !text;
}

function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text) node.textContent = text;
  if (className) node.className = className;
  return node;
}

function renderBoard(data) {
  board.replaceChildren();
  if (!data) return;
  const initiatives = element('section');
  initiatives.append(element('h2', 'Active initiatives'));
  if (!data.initiatives) initiatives.append(element('p', 'Initiatives are disabled or unavailable.'));
  else {
    const { items, partial } = data.initiatives;
    if (!items.length) initiatives.append(element('p', 'No active initiatives.'));
    else {
      const list = element('ul');
      for (const item of items) list.append(element('li', `${item.title} · ${item.completed}/${item.total} issues complete`));
      initiatives.append(list);
    }
    if (partial) initiatives.append(element('p', 'More active initiatives may be available.'));
  }
  const issues = element('section');
  issues.append(element('h2', 'Issues'));
  if (data.partial) issues.append(element('p', 'Showing up to 200 recent issues. Progress counts listed subtasks only.'));
  if (!data.count) issues.append(element('p', 'No issues to show.'));
  for (const group of data.groups) {
    if (!group.issues.length) continue;
    const column = element('section', null, 'column');
    column.append(element('h3', `${group.name} · ${group.issues.length}`));
    const list = element('ul');
    for (const issue of group.issues) {
      const row = element('li', null, 'issue');
      row.append(element('span', `${issue.identifier} · ${issue.title}`));
      if (issue.progress) row.append(element('small', `${issue.progress.completed}/${issue.progress.total} listed subtasks complete`));
      list.append(row);
    }
    column.append(list);
    issues.append(column);
  }
  board.append(initiatives, issues);
}

let shownCatalog;
let shownBoard;
let shownStatus;
const host = globalThis.orca;
const panel = createPanel({
  readSetting: () => host.settings.get(URL_SETTING),
  request: (...args) => host.plugin.request(...args),
  clearDraft: () => { key.value = ''; },
  render(state) {
    if (state.catalogStatus !== shownStatus) {
      if (['missing_key', 'unauthorized', 'secret_unavailable', 'invalid_url'].includes(state.catalogStatus)) credentials.open = true;
      if (state.catalog && ['missing_key', 'unauthorized'].includes(shownStatus)) credentials.open = false;
      shownStatus = state.catalogStatus;
    }
    message(connectionStatus, state.catalogStatus ? messages[state.catalogStatus]
      : !state.catalog?.projects.length ? 'No accessible projects.' : '');
    message(find('action-status'), messages[state.actionStatus]);
    message(find('base'), state.base ?? messages.invalid_url);
    key.disabled = !state.base || state.saving;
    find('save').disabled = key.disabled;
    find('clear').disabled = key.disabled;
    refresh.disabled = state.catalogStatus === 'loading' || state.saving;
    picker.hidden = !state.catalog?.projects.length;
    find('catalog-note').hidden = !state.catalog?.partial;
    if (shownCatalog !== state.catalog) {
      shownCatalog = state.catalog;
      select.replaceChildren(new Option('Choose a project', ''), ...(state.catalog?.projects.map(
        ({ id, team, name, ref }) => new Option(`${team} / ${name} (${ref})`, id),
      ) ?? []));
    }
    select.value = state.selected ?? '';
    const mapped = state.focus?.mappedId === state.selected && state.selected !== null;
    message(find('focus'), mapped ? `Following ${state.focus.name}.`
      : state.focus ? `Focused: ${state.focus.name}.` : 'Choose a project manually when no Orca repository is available.');
    remember.hidden = !state.focus || !state.selected || mapped;
    remember.disabled = state.mapping;
    message(find('board-status'), state.boardStatus === 'loading' ? 'Loading board…' : messages[state.boardStatus]);
    if (shownBoard !== state.board) { shownBoard = state.board; renderBoard(state.board); }
  },
});

find('connect').addEventListener('submit', (event) => { event.preventDefault(); void panel.saveKey(key.value); });
find('clear').addEventListener('click', () => { void panel.clearKey(); });
refresh.addEventListener('click', () => { void panel.refresh(); });
select.addEventListener('change', () => { void panel.pick(Number(select.value) || null); });
remember.addEventListener('click', () => { void panel.remember(); });
const workspace = host.on('workspace.changed', (event) => { void panel.workspaceChanged(event); });
const settings = host.settings.onDidChange(({ key: changed }) => { if (changed === URL_SETTING) void panel.urlChanged(); });
window.addEventListener('pagehide', () => { workspace.dispose(); settings.dispose(); panel.close(); }, { once: true });
void panel.open();
