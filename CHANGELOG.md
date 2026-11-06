# Changelog

From 0.2.1 on, release-please writes each entry from the Conventional Commits merged since the
previous release (`release-please-config.json`). The first release was written by hand.

## [0.3.0](https://github.com/phaenonlang/vscode/compare/v0.2.0...v0.3.0) (2026-11-06)


### Features

* Phaenon for VS Code ([b9c1208](https://github.com/phaenonlang/vscode/commit/b9c1208b3485f7d5e8ae138ad1ead2642b31d2fa))

## [0.2.0](https://github.com/phaenonlang/vscode/releases/tag/v0.2.0) (2026-11-06)

The first release, for VS Code 1.91 and newer, with the compiler's 0.2.0.

The TextMate grammar for `.phn`: PHP's, with Phaenon's syntax (generics, `list<T>`, `map<K, V>`,
tuples, closure types, expression bodies and `throws`, `concurrently` and `spawn`) injected. One
`phn lsp` per project, started from the project's own `vendor/bin/phn`, for the compiler's
diagnostics, hover, go to definition, completion, formatting and the build on save. Build, check
and watch as tasks; `phn trace` of the selection or the terminal's text to `.phn` positions.
