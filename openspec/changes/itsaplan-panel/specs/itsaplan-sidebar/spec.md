## ADDED Requirements

### Requirement: Read-only HTTPS connection
The plugin SHALL use an approved trusted worker to read one configured Itsaplan HTTPS API. The API base SHALL be an Orca setting and the API key SHALL be stored only through Orca’s secret store, bound to that exact base including any proxy path. The key SHALL NOT be returned, restored into the panel, sent on a redirect, or included in errors or logs. The worker SHALL make no tracker write requests.

#### Scenario: Connection from Orca
- **WHEN** projects could not load because no key was present and a person saves a valid key for the displayed HTTPS API base
- **THEN** the worker uses the stored key for an HTTPS GET to that base and the sidebar lists accessible projects without a manual refresh

#### Scenario: Unsafe or unavailable connection
- **WHEN** the URL is invalid, the key is missing or for a different base, or a required project or board request fails or redirects
- **THEN** the panel shows an actionable message without printing the key or response body and clears any board it can no longer verify

#### Scenario: URL changes during credential entry or save
- **WHEN** the person enters a key for one base and the URL is edited before submission or while saving is in flight
- **THEN** the stale draft is discarded or refused, or remains bound to its original base, and the worker does not authenticate to the new base with the old key

#### Scenario: Prefixed request and refused redirect
- **WHEN** a configured HTTPS API is mounted under a path prefix and a request redirects to a different destination
- **THEN** the first GET retains the prefix; the redirect destination receives no request or key and the panel shows a connection error

#### Scenario: Oversized or stalled response
- **WHEN** a required body crosses the byte cap or the request deadline fires while reading its body
- **THEN** that read terminates with a bounded error and the panel does not render unverifiable data

#### Scenario: Burst of project selections
- **WHEN** a user changes projects while earlier reads are in flight
- **THEN** the worker keeps at most one active batch and one pending read, and the current selection renders when its request finishes without showing superseded results

#### Scenario: Two panel sessions compete
- **WHEN** two panel sessions have filled the active and pending slots and a different session submits another read
- **THEN** it receives a busy result without aborting a read owned by another session

### Requirement: Project board summary
The plugin SHALL initiate tracker reads only for an open sidebar. The sidebar SHALL distinguish teams, show permitted active initiatives, group recent issues by tracker column order, show completion of listed direct subtasks, and flag capped results. The plugin SHALL NOT poll, read individual issues, write to the tracker, create worktrees, ship tracker-specific presets, or integrate with native Orca Tasks.

#### Scenario: No open sidebar
- **WHEN** the worker starts or Orca settings or workspace focus change without an open sidebar session
- **THEN** no tracker GET is initiated

#### Scenario: Projects across teams
- **WHEN** two accessible teams have projects with the same key
- **THEN** both projects can be selected independently and use their qualified project references

#### Scenario: Grouped board with subtasks
- **WHEN** an active initiative reports 2 completed issues out of 5 and a parent has two listed direct subtasks, one in a completed column and one in an open column
- **THEN** the initiative shows 2/5 and the parent shows 1/2 alongside column groups, without fetching individual issues

#### Scenario: Unavailable initiatives and missing column
- **WHEN** initiatives are disabled or denied and an issue names a column missing from its scaffold
- **THEN** the panel reports the initiative section unavailable and shows that issue under an unknown column

#### Scenario: Partial board
- **WHEN** an initiative page reports more matches than returned rows, or the unpaginated issue or project result reaches its projection cap
- **THEN** the panel marks the corresponding result potentially incomplete

### Requirement: Follow a focused workspace
The panel SHALL follow Orca’s focused workspace. A manually selected tracker project lasts until focus changes; no per-workspace selection is saved or restored. The panel SHALL NOT infer a tracker project by repository name.

#### Scenario: Switch workspace and return
- **WHEN** a user picks a project, switches to another workspace, and returns
- **THEN** the panel clears the selection and does not restore it; an old board response cannot redraw it

#### Scenario: Refresh the displayed view
- **WHEN** the user presses Refresh
- **THEN** the panel reloads the selected project board if focus is unchanged, or the picker when there is no current selection

#### Scenario: Focus changes before its event arrives
- **WHEN** Refresh detects a different current workspace before Orca delivers the notification
- **THEN** the panel clears the selection and does not request the previous board

#### Scenario: Workspace event without a public identifier
- **WHEN** an Orca event omits the public workspace identifier
- **THEN** the panel rechecks focus and keeps the selection if the resolved identity did not change

#### Scenario: Tracker route reused during a board load
- **WHEN** the tracker issues read succeeds but the scaffold identifies a replacement project under the same ref
- **THEN** the board load is refused and no issue from either project is rendered under that selection

#### Scenario: No reliable workspace identity
- **WHEN** Orca does not expose a focused workspace’s identity
- **THEN** the project picker remains usable without guessing or editing the workspace
