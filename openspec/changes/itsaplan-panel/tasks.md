# Tasks

## Test map

| Requirement | Scenario | Test file | Test name | State |
|---|---|---|---|---|
| Read-only HTTPS connection | Connection from Orca | test/panel.test.mjs | key save recovers missing credentials | green |
| Read-only HTTPS connection | Unsafe or unavailable connection | test/worker.test.mjs | refuses unpaired credentials without a GET | green |
| Read-only HTTPS connection | URL changes during credential entry or save | test/panel.test.mjs; test/worker.test.mjs | editing the URL clears an unsent key before showing the new base; URL edits cannot rebind a pending key | green |
| Read-only HTTPS connection | Prefixed request and refused redirect | test/worker.test.mjs | keeps proxy path and refuses redirects | green |
| Read-only HTTPS connection | Oversized or stalled response | test/worker.test.mjs | bounds decoded bytes and slow bodies | green |
| Read-only HTTPS connection | Burst of project selections | test/worker.test.mjs | coalesces superseded selections | green |
| Read-only HTTPS connection | Two panel sessions compete | test/worker.test.mjs | preserves another panel's request | green |
| Project board summary | No open sidebar | test/panel.test.mjs; test/worker.test.mjs | closed panel cannot start tracker reads; synthetic dev caller cannot start a read without a live-frame witness | green |
| Project board summary | Projects across teams | test/worker.test.mjs | loads distinct boards for the same project key in two teams | green |
| Project board summary | Grouped board with subtasks | test/worker.test.mjs | projects only bounded board data and counts listed children | green |
| Project board summary | Unavailable initiatives and missing column | test/worker.test.mjs | optional initiatives do not hide unknown-column issues | green |
| Project board summary | Partial board | test/worker.test.mjs | reports partial board and catalog results | green |
| Follow a focused workspace | Switch workspace and return | test/panel.test.mjs | switching workspaces clears the choice and does not remember it on return | green |
| Follow a focused workspace | Refresh the displayed view | test/panel.test.mjs | refresh reloads the displayed board without reloading the picker; no workspace identity still permits manual selection and catalog refresh | green |
| Follow a focused workspace | Focus changes before its event arrives | test/panel.test.mjs | refresh does not reload the old board if the worker sees focus move first | green |
| Follow a focused workspace | Workspace event without a public identifier | test/panel.test.mjs; test/worker.test.mjs | an ID-less event rechecks focus without discarding a choice in the same workspace; projects raw workspace identities as distinct opaque focus tokens | green |
| Follow a focused workspace | Tracker route reused during a board load | test/worker.test.mjs | rejects replacement scaffold after issue read | green |
| Follow a focused workspace | No reliable workspace identity | test/panel.test.mjs | no workspace identity still permits manual selection and catalog refresh | green |

## 1. Read-only sidebar

- [x] 1.1 [evidence] Verify trusted-worker network and encrypted storage on the live host → evidence/trusted-worker-https.md
- [x] 1.2 Add no-dependency pnpm policy and exercise the worker and panel state scenarios using Node tests.
- [x] 1.3 Implement the worker, focus matching, and Orca sidebar; turn the mapped scenarios green.
- [x] 1.4 [evidence] Verify the live panel, document the scope of the API and workspace evidence, and record installation limits → evidence/panel-smoke.md
