# Proposal

## What Itsaplan and Orca users need

- A way to map several worktrees of one repository to the same tracker project without assuming that their names match, plus a manual choice for ad hoc work.
- Project labels that distinguish teams when keys or names repeat, and support for teams with no access to one another.
- A configurable self-hosted HTTPS API URL, including an optional reverse-proxy path. Some users may want multiple instances or accounts later.
- An API key whose scope and project membership match the intended view. Credentials should be easy to rotate without being shown again or silently sent to another instance.

## Why

People working in Orca currently have to switch to their tracker to see the project’s priorities and issue states. This spike tests whether Orca’s plugin host can provide a useful read-only view without adding a native task provider. See [Orca #38290](https://github.com/stablyai/orca/issues/38290) for the broader provider request.

## What Changes

- Prove HTTPS access in an approved Orca trusted worker using its real secret store, then show a sidebar with project selection, active initiatives and issues grouped by board column.
- Let users pick any visible project and optionally remember the choice for the focused Orca Git project. Determine what identity data Orca exposes for local, WSL and SSH workspaces.
- Show progress inferred from listed subtasks, with no extra request per issue. Report which claims the live spike verified, and which environments it could not observe.
- Scope: one instance per plugin installation and no Itsaplan writes, background polling, tracker-specific presets, worktree creation or native Orca Tasks integration.

## Capabilities

### New Capabilities

- `itsaplan-sidebar`: Read-only project boards with encrypted connection credentials and an optional focused-workspace project mapping.

### Modified Capabilities

None.

## Impact

Orca desktop sidebar and plugin settings; outbound Itsaplan REST GET requests from the worker. No package dependencies or build step.

## Decision Making

DECISION_MAKING: important
- **Source:** Task scope and owner’s read-only decision.

### S1: Read-only spike

- **Choice:** A narrow sidebar and live feasibility proof, without tracker mutation or native provider integration.
- **Rejected:** Reimplement the full Orca task-provider proposal before proving the plugin interface.
- **Reversal cost:** Low; a later integration can use a different surface.
- **Important:** Yes; review and permission limits are part of the spike.
- **Chosen by:** User.
