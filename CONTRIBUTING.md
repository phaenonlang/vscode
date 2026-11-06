# Contributing

This extension is one part of Phaenon. The compiler, `phn`, is
[phaenonlang/phaenon](https://github.com/phaenonlang/phaenon); the language's design, and the
decisions behind it, are in [phaenonlang/design](https://github.com/phaenonlang/design). Everything
the language server answers (diagnostics, hover, completion, formatting, the build on save) comes
from the compiler, so a wrong type or a missing finding is the compiler's issue. Highlighting, the
commands, the tasks and the settings are this repository's. A change to the language starts as a
section in the design.

## Setup

Node.js (an LTS release) and npm:

```sh
npm ci                 # the locked dependencies
npm test               # tsc, then the unit and grammar tests
npm run build          # esbuild → dist/extension.js, what VS Code loads
npm run package        # → phaenon-<version>.vsix
```

`AGENTS.md` describes the source layout and every test variable.

## Testing

- **Grammar.** `test/grammar/constructs.phn` is tokenized into `test/grammar/constructs.tokens`.
  After a change to `syntaxes/phaenon.tmLanguage.json`, `PHAENON_UPDATE=1 npm test` rewrites the
  tokens; read their diff before committing it. `PHAENON_TREES=<dir>[:<dir>…] npm test` checks
  that every `.phn` under those directories ends with no rule left open.
- **The PhpStorm plugin's copies.** The grammar and `language-configuration.json` are copied
  verbatim into [phaenonlang/jetbrains](https://github.com/phaenonlang/jetbrains) under
  `textmate/phaenon/`. Edit them here; with a `../jetbrains` checkout beside this one, `npm test`
  fails while the copies are stale.
- **End to end.** The extension runs in a real VS Code against a real compiler. Build `phn` in a
  checkout of phaenonlang/phaenon beside this one (`go build -o bin/phn ./cmd/phn`), have `php` on
  the PATH, then run `PHAENON_PHN=../phaenon/bin/phn npm run test:e2e`. VS Code is downloaded into
  `.vscode-test`; `PHAENON_VSCODE_VERSION=1.91.0` runs the oldest release the extension supports.

CI runs the unit, grammar and end-to-end tests on every pull request.

## Pull requests

Pull requests are squash-merged: the title becomes the commit on `main`, and a release's version
and changelog are read from those commits. So:

- The title and every commit are [Conventional Commits](https://www.conventionalcommits.org):
  `type(scope)!: subject`, the scope and the `!` optional, the type one of `feat`, `fix`, `docs`,
  `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore` and `revert`. A commit's body says
  what changed and why.
- The title's release impact equals the highest of the commits': `!` or a `BREAKING CHANGE:`
  footer is major, `feat` minor, `fix` and `revert` patch, every other type none.
- The PR semantics check enforces both; CI must pass.

## Releases

A release is cut by merging the release PR that release-please keeps open on `main`
(`chore(main): release X.Y.Z`): it bumps `package.json`'s version and writes the `CHANGELOG.md`
entry from the merged commits. The merge tags `vX.Y.Z`, makes the GitHub release with the `.vsix`
and publishes the version to the VS Code Marketplace and to Open VSX
(`.github/workflows/release.yml`).

Report a security issue privately, as `SECURITY.md` describes, not in an issue or a pull request.
