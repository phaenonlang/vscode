# Phaenon for VS Code — agent guide

The VS Code extension for `.phn` files (TypeScript): the TextMate grammar, the language
configuration, an LSP client of the compiler's `phn lsp`, and commands and tasks around `phn build`,
`check`, `watch` and `trace` (design/tooling.md §6.3). The README says what a user gets. The map of
every Phaenon repo, the working method and the commit rules are in the compiler repo: read
`../phaenon/AGENTS.md` first.

```sh
npm install
npm test               # tsc, then node --test: unit tests and the grammar tests
npm run build          # esbuild → dist/extension.js, what VS Code loads
npm run package        # → phaenon-<version>.vsix (minified bundle, .vscodeignore's allowlist)

PHAENON_UPDATE=1 npm test                                   # rewrite test/grammar/constructs.tokens
PHAENON_TREES=~/labs/tequila/core:~/labs/tequila/tq-cli-phaenon-dogfood npm test   # tokenize whole trees
PHAENON_PHN=../phaenon/bin/phn npm run test:e2e             # the extension in VS Code against a real phn
PHAENON_VSCODE_VERSION=1.91.0 PHAENON_PHN=../phaenon/bin/phn npm run test:e2e      # the oldest VS Code supported
```

- Dependencies: `vscode-languageclient` at run time, bundled by esbuild; the rest is dev tooling.
  The engine floor, `^1.91.0`, is the client's own; `@types/vscode` stays at that floor, so an API
  of a newer VS Code does not compile.
- `src/project.ts` (no `vscode` import, unit-tested): a file's project (the nearest `phaenon.json`,
  else `composer.json`, as `phn lsp` finds its own), installed code (under a `vendor/` beside a
  `composer.json`: no server), the `phn` to run (setting, `$PHN_BINARY`, `vendor/bin/phn`, PATH: the
  PhpStorm plugin's order). `src/build.ts`: the `phaenon/build` notification and the status bar's
  texts, the plugin's. `src/trace.ts`: `phn trace`'s arguments and its run.
- `src/extension.ts`: one `LanguageClient` per project, its `workspaceFolder` the project's directory
  so that `rootUri` names the project, not the workspace folder around it; each client is offered
  every `.phn` and `ownedBy` keeps it to its project's (a nested project's files reach one server).
  Commands and the `phaenon` task type run `phn` as `ProcessExecution`s in the project. The trace of
  the terminal's text goes through the clipboard, which is put back. The returned `PhaenonApi` exists
  for the e2e tests.
- `syntaxes/phaenon.tmLanguage.json`: `source.php` plus injections for Phaenon's syntax, with PHP's
  scope names wherever PHP has the construct. Rules: an injection applies inside every rule,
  including this grammar's own, ahead of that rule's patterns, so a rule that must keep a name
  takes it in its own begin (`generic-new`); a PHP rule that cannot read a Phaenon type falls back
  to looser ones, and the ternary rule left open by a property's `?map<…>` swallowed the class
  (`nullable-generic`).
- Grammar tests (`test/grammar`): `constructs.phn` → `constructs.tokens`, the innermost scope of
  every token, written against the PHP grammar pinned in `test/grammar/php` (VS Code 1.145.0's; its
  README says how to refresh it). The tokens Phaenon's rules name must come out the same with the
  PHP grammar of every VS Code found (`.vscode-test`, `/Applications`, `$PHAENON_PHP_GRAMMAR`), and
  every rule `source.php#…` the grammar includes must exist there. `PHAENON_TREES` checks that every
  `.phn` ends with no rule open where PHP's grammar alone closes them.
- The grammar and `language-configuration.json` have verbatim copies in
  `../jetbrains/textmate/phaenon/`, the PhpStorm plugin's TextMate bundle; `test/unit/copies.test.ts`
  compares them when that checkout is there. Edit them here, then copy.
- e2e tests (`test/e2e`): `run.ts` copies `fixture/` into a temporary workspace (a project `app`, a
  project nested in it, an installed package under its `vendor/`) and starts VS Code from
  `.vscode-test` with `--disable-extensions --disable-workspace-trust`; `suite/` runs in the extension
  host with its own small runner. The compiler is `PHN_BINARY`, set from `PHAENON_PHN`.
- Commit messages follow Conventional Commits (`feat:`, `fix:`, `test:`, `docs:`, … with a body that
  says what changed and why), with no attribution lines and no `Co-Authored-By`: the repository will
  be public.
