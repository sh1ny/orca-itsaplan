# Contributing to It's a Plan for Orca

Thanks for helping. This Orca plugin shows your It's a Plan projects, initiatives and issues next to your Orca workspaces. It only reads from the tracker.

The plugin is a spike: small, and its limits are listed in the README.

## Ways to help

- **Report a bug or suggest an idea.** Open an [issue](https://github.com/sh1ny/orca-itsaplan/issues/new/choose). The forms say what helps; only the first box is required.
- **Fix something small** (a typo, a doc, an obvious bug): send a pull request straight away.
- **Anything bigger** (a new feature, a new dependency, or a change to how the parts talk to each other): open an issue first, so we can agree on the approach before you spend time on it.
- **Found a security problem?** Don't open an issue. Report it privately as [SECURITY.md](SECURITY.md) describes.

## How the project is planned

Larger changes are planned with [OpenSpec](https://github.com/Fission-AI/OpenSpec) in the `openspec/` folder. You don't need it to contribute: describe the change in your issue or pull request, and a maintainer will handle the planning side.

## Setup

Use the Node and pnpm versions the [README](README.md#development) names.

```sh
pnpm install
pnpm test                    # dependency-free tests
orca plugin validate .       # validates the manifest
orca plugin dev load .       # loads your checkout into Orca Desktop
```

## Making a change

- Branch from `main` and keep each pull request to one change.
- **Tests.** Add or update tests for behaviour you change, and keep them dependency-free like the existing ones.
- **Commit messages** follow [Conventional Commits](https://www.conventionalcommits.org/): `type(scope): summary`, for example `fix(panel): keep the selected project on refresh`. If you get it wrong, a maintainer will fix it when merging.
- **Write it yourself.** Don't copy code from other projects, including translating it from another language. Adding a dependency is fine when its licence is compatible, but mention it in the pull request.

### Rules specific to It's a Plan for Orca

- **The plugin only reads.** It sends GET requests and nothing else. A change that writes to the tracker is a bigger change, so open an issue first.
- **No runtime packages.** The plugin ships without dependencies. A new development dependency needs a reason in the PR; the pnpm settings already refuse packages released in the last seven days and block install scripts.
- Never log, display or store an API key outside Orca's encrypted secrets.

## Pull requests

The template asks for three things: a short **Summary**, what it's **Linked** to (an issue, or "none"), and how you **tested** it. Everything else is optional.

CI runs on every pull request. If it fails and you can't see why, say so in the pull request and we'll help. A maintainer reviews and merges.

## Licence

By contributing, you agree that your contribution is licensed under the project's [MIT licence](LICENSE).
