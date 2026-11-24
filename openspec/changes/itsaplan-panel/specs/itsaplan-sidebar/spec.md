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
The plugin SHALL initiate tracker reads only for an open sidebar session. The sidebar SHALL distinguish projects by team, show active initiatives for the selected project when permitted, and group recent issues by tracker column order. It SHALL show completed versus total listed direct subtasks when available and visibly identify results limited by the spike. It SHALL NOT poll, perform per-issue reads or tracker writes, create worktrees, include tracker-specific presets, or add a native Orca Tasks provider.

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
The panel SHALL offer a manual choice without repository metadata. When an exact focus match exposes one Orca Git project’s host and project identity, the panel SHALL let the user remember the selected tracker project’s stable id and use it on subsequent focus. It SHALL NOT map by repository name.

#### Scenario: Switch between mapped projects
- **WHEN** focus changes between workspaces belonging to two differently mapped Orca Git projects
- **THEN** the panel loads the mapped Itsaplan project for each and an old request cannot replace the new selection

#### Scenario: Focus and project list resolve in either order
- **WHEN** initial or new-instance focus resolves before or after the fresh projects list
- **THEN** the picker loads in either order, and the available mapped project is selected after both results arrive unless superseded by a manual choice

#### Scenario: Reused tracker route
- **WHEN** a remembered tracker project is deleted and its qualified ref now identifies a different project
- **THEN** the replacement is not selected by that mapping and remains manually selectable

#### Scenario: Tracker route reused during a board load
- **WHEN** the tracker issues read succeeds but the scaffold identifies a replacement project under the same ref
- **THEN** the board load is refused and no issue from either project is rendered under that selection

#### Scenario: Manual choice during focus lookup
- **WHEN** a person picks a project manually while a focus lookup is pending
- **THEN** the pending result does not override the newer manual selection

#### Scenario: No reliable repository identity
- **WHEN** Orca does not expose a focused workspace’s Git project identity
- **THEN** the project picker remains usable without guessing or editing the workspace
