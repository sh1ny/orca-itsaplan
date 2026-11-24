# Review

## Metadata

- **Round:** 3
- **Prior round:** REVISE — list/board arbitration blocked; four Moderate findings.
- **Reviewer:** fresh-context subagent (omp)
- **Reviewed:** Live `proposal.md`, `design.md`, `specs/itsaplan-sidebar/spec.md` and prior `review.md`. Rechecked pinned Orca `v1.4.273` authoring-guide, workspace projection/contract, Settings IPC, panel bridge and frame-facade ranges, and pinned Itsaplan `57f06d1494fcb683799a7b7e27649cb26d1e34b7` project, issue and initiative route/model ranges, column model and project create/delete ranges. Used round 2 observations for unchanged claims. No applicable ADR or referenced store was present.

## Findings

Round 2 recheck: **C1 fixed** — the fresh list gates board reads, either completion order reconciles the latest focus and manual intent, and session ownership prevents cross-session displacement (`design.md:99,103`; `spec.md:26–32,60–62`). **M1 fixed for reuse visible to a fresh list** — the stable ID replaces the stored route, but reuse during the board batch remains uncovered (M1 below). **M2 fixed** — the spec independently covers a save in flight, prefix and no redirect request, oversized/stalled bodies, and bounded supersession (`spec.md:14–32`). **M3 fixed** — `design.md:13` points to the exact authority, row limit, Settings notification chain, answer ceiling and session identity; the pinned ranges support those claims. **M4 partially fixed** — no per-issue reads, worktree creation, tracker presets or name-based mapping are explicit; panel-only loading still is not (M3 below).

### Critical (blocking)

None.

### Moderate

1. **M1 — A matching scaffold does not prove that the issue response belongs to the selected project.** `design.md:31–33,99` validates the scaffold ID but fetches issues in parallel by the same reusable ref. If the scaffold resolves old project A before deletion and the issue request resolves replacement B after creation, A passes the ID check and B's titles can render under A, typically in the unknown-column group. Itsaplan's scaffold and issue handlers operate on their own resolved project (`projects/index.ts:143–175`, `issues/index.ts:477–519`); the actual lightweight array schema (`issues/model.ts:322–349`) has no `projectId`. The initiative route is also separate, but its rows do carry `projectId` (`initiatives/index.ts:108–134`, `initiatives/model.ts:64–83`). The fresh-list reuse fixture at `spec.md:64–66` cannot catch a change between endpoint reads.
2. **M2 — Saving a valid key does not have a defined path back to a fresh project list.** `design.md:27,103` describes the save and refresh on open or URL change but does not say what a successful current-base save does to the read generation. The URL-change refresh can fail for lack of a key before the save succeeds. The pinned panel facade only subscribes to settings and storage changes (`plugin-panel-shell-facades.ts:60–78`); a write to the separate secret store is not a URL change. The picker can stay empty until an unrelated refresh, contrary to `spec.md:6–8`. On same-base rotation, an old-key response can likewise populate the picker after the new key is saved, including choices the new key cannot read.
3. **M3 — The durable board requirement still allows a one-off load while the sidebar is closed.** `design.md:51` carries panel-only loading into Project board summary. `spec.md:35` requires particular behavior while open and forbids polling, but neither clause forbids a worker doing a one-off GET on startup while closed. That would send credentials outside the intentionally panel-driven scope without failing the requirement.

### Suggestions

None.

## Verdict

VERDICT: APPROVE_WITH_CHANGES

## Required Changes

1. In D3 and Resource Bounds, define how the board rejects issue data from a ref reused during the batch, without adding per-issue reads or exceeding three GETs. With the pinned lightweight issue route, one option is to finish the issue read before requesting and validating the scaffold, then check returned initiative `projectId`s before projection. Treat a wrong required identity as an unverifiable board, not unknown-column data. Extend the route-reuse scenario to assert that no replacement rows render when the ref changes between reads.
2. In Flow & State Gaps, make a successful key save for the current base advance the connection generation, discard or suppress old-key results, and start a fresh list through the same list-before-board path. A save reply superseded by a URL edit must not restart the old connection. Make the connection scenario assert that saving the key after a missing-key failure loads the picker without a manual refresh.
3. In Project board summary, state explicitly that tracker reads are initiated only for an open sidebar session. Add a deterministic closed-panel case that asserts no tracker GET starts without a panel session.

CHANGES_APPLIED: no

## Rebuttals

## Owner checkpoint (round 3)

Owner decision: “make only the three required edits … No further design-review rounds; then continue with the spec as written: tasks, implementation, the live panel check in Orca, pre-ship, archive on the PR branch, open the PR, and own it until it's ready to merge.”

The three requested edits are in the design and delta spec. The owner authorized proceeding without the reviewer’s separate confirmation; the round-3 reviewer verdict and `CHANGES_APPLIED` marker above are unchanged. This is an explicit owner exception to the confirmation gate, not a new reviewer approval or a waiver of the pre-ship review.

## Owner checkpoint (pre-ship, after two fix rounds)

The owner authorized one additional pre-ship fix round for F10: invalidate the preserved manual choice on a real focus change, test both A→B→A during Refresh and Refresh before focus resolves without real-time waits, and rerun the OMP pre-ship review. Ship only if that review passes; no waiver or further round was authorized.

## Owner scope decision (pre-ship cases F10–F12)

The owner superseded the remembered-mapping scope: “the panel follows the focused workspace; a hand-picked project lasts only until the focused workspace changes. Nothing is remembered per workspace across switches, and Refresh reloads whatever is shown now.”

- **F10 — resolved by scope change.** Returning to a workspace leaves the picker unselected; there is no remembered project or preserved override to restore.
- **F11 — resolved by scope change.** Refresh checks current focus before reloading the current view. If focus already moved, the old selection is cleared instead of refreshed.
- **F12 — resolved by scope change.** An event without a public workspace ID only triggers an identity check. The same resolved workspace remains selected.

One OMP pre-ship review is authorized on the reduced scope. A blocker stops shipment; no waiver or additional round is authorized.


<!-- specwright-design-progress -->
<!-- eyJ2ZXJzaW9uIjoxLCJyb3VuZCI6Mywic2NvcGVfcm91bmQiOjMsImV4dGVuZGVkIjpmYWxzZSwibG9nIjpbeyJyb3VuZCI6MiwicmVwYWlycyI6IkJpbmQgZHJhZnQgY3JlZGVudGlhbHMgdG8gdmlzaWJsZSBiYXNlOyBpbnZhbGlkYXRlIHN0YWxlIGZvY3VzIGFuZCBzZXR0aW5ncyB3b3JrOyBib3VuZCBsaXZlIHJlYWRzOyBjbGFyaWZ5IGNvbnRyYWN0cyBhbmQgZXhjbHVzaW9ucyJ9LHsicm91bmQiOjMsInJlcGFpcnMiOiJNYWtlIHRoZSBsaXN0IGEgcHJlcmVxdWlzaXRlOyBpc29sYXRlIGxhbmUgb3duZXJzaGlwIGJ5IHNlc3Npb247IHBlcnNpc3QgdHJhY2tlciBpZHM7IHRpZ2h0ZW4gc2NlbmFyaW9zIGFuZCBob3N0IGNpdGF0aW9ucyJ9XX0= -->

## Review progress

- Validated round: 3 (scope round 3)
- Repairs before round 2: "Bind draft credentials to visible base; invalidate stale focus and settings work; bound live reads; clarify contracts and exclusions"
- Repairs before round 3: "Make the list a prerequisite; isolate lane ownership by session; persist tracker ids; tighten scenarios and host citations"
