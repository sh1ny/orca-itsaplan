# Tasks

## Test map

| Requirement | Scenario | Test file | Test name | State |
|---|---|---|---|---|
| Read-only HTTPS connection | Connection from Orca | test/panel.test.mjs | key save recovers missing credentials | red |
| Read-only HTTPS connection | Unsafe or unavailable connection | test/worker.test.mjs | refuses unpaired credentials without a GET | red |
| Read-only HTTPS connection | URL changes during credential entry or save | test/worker.test.mjs | URL edits cannot rebind a pending key | red |
| Read-only HTTPS connection | Prefixed request and refused redirect | test/worker.test.mjs | keeps proxy path and refuses redirects | red |
| Read-only HTTPS connection | Oversized or stalled response | test/worker.test.mjs | bounds decoded bytes and slow bodies | red |
| Read-only HTTPS connection | Burst of project selections | test/worker.test.mjs | coalesces superseded selections | red |
| Read-only HTTPS connection | Two panel sessions compete | test/worker.test.mjs | preserves another panel's request | red |
| Project board summary | No open sidebar | test/panel.test.mjs | closed panel cannot start tracker reads | red |
| Project board summary | Projects across teams | test/worker.test.mjs | preserves qualified projects from different teams | red |
| Project board summary | Grouped board with subtasks | test/worker.test.mjs | projects only bounded board data and counts listed children | red |
| Project board summary | Unavailable initiatives and missing column | test/worker.test.mjs | optional initiatives do not hide unknown-column issues | red |
| Project board summary | Partial board | test/worker.test.mjs | reports partial board and catalog results | red |
| Follow a focused workspace | Switch between mapped projects | test/panel.test.mjs | mapped focus supersedes stale board replies | red |
| Follow a focused workspace | Focus and project list resolve in either order | test/panel.test.mjs | focus and project list complete in either order | red |
| Follow a focused workspace | Reused tracker route | test/panel.test.mjs | a replacement project does not inherit a mapping | red |
| Follow a focused workspace | Tracker route reused during a board load | test/worker.test.mjs | rejects replacement scaffold after issue read | red |
| Follow a focused workspace | Manual choice during focus lookup | test/panel.test.mjs | manual selection wins a pending focus lookup | red |
| Follow a focused workspace | No reliable repository identity | test/worker.test.mjs | ambiguous or absent workspace metadata falls back to manual | red |

## 1. Read-only sidebar

- [ ] 1.1 [evidence] Verify trusted-worker network and encrypted storage on the live host → evidence/trusted-worker-https.md
- [ ] 1.2 Add no-dependency pnpm policy and exercise the worker and panel state scenarios using Node tests.
- [ ] 1.3 Implement the worker, focus matching, and Orca sidebar; turn the mapped scenarios green.
- [ ] 1.4 [evidence] Verify the live panel, document the scope of the API and workspace evidence, and record installation limits → evidence/panel-smoke.md
