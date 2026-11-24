# It's a Plan for Orca

A read-only sidebar for self-hosted [It's a Plan](https://github.com/croffasia/itsaplan). Browse accessible projects across teams, see active initiatives, and view recent issues in the tracker’s column order. No tracker writes, polling, external packages, or build required.

## Install and connect

1. In Orca Desktop **1.4.273 or newer**, add this repository in **Settings → Plugins**, or load a local checkout with `orca plugin dev load .`.
2. Review the approval prompt. The trusted Node worker runs on the Orca host; the plugin requests its own settings, encrypted secrets and mapping storage, plus read access to Orca workspace metadata. Only the worker makes tracker requests.
3. In the plugin’s settings, enter the **Itsaplan HTTPS API URL**, including a reverse-proxy path if needed, for example `https://tracker.example.org/api`. The Orca host must reach that address and trust its TLS certificate. Redirects are not followed.
4. Open **It's a Plan** in the right sidebar, expand **Connection**, check the displayed API address, and enter a key authorized to read your projects. The field is cleared on submission; the plugin never fills it with a saved key. **Clear key** removes it. A URL change requires a key saved for the new address.
5. Choose a project. For a focused Git workspace with a resolvable identity, **Remember for this Orca project** uses that preference in its other worktrees. Manual choice remains available when no mapping applies. **Refresh** reloads the current snapshot.

## Spike limits

- One API base per installation; project access and key scopes are enforced by the tracker.
- Up to 500 accessible projects, 200 recent issues, and the first 100 active initiatives for the selected project. The pane marks partial results. Subtask counts are derived from the listed children; checklist totals require extra per-issue requests and are not shown.
- The worker can join focused workspace context to Orca’s Git project id and host id. The plugin host does not expose a Git remote URL. Without a unique Git project/host match, including some remote or folder contexts, use the manual picker. No repository-name guessing or native Orca Tasks integration.

## Development

Use Node 22.12 or newer and pnpm 11.1.1. `pnpm test` runs dependency-free tests; `orca plugin validate .` validates the manifest. The pnpm configuration requires a seven-day dependency release age and blocks install scripts; there are no packages to audit or allowlist.
