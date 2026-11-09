# Changelog

From 0.2.1 on, release-please writes each entry from the Conventional Commits merged since the
previous release (`release-please-config.json`). The first release was written by hand.

## [0.3.0](https://github.com/phaenonlang/vscode/compare/v0.2.0...v0.3.0) (2026-11-09)


### ⚠ BREAKING CHANGES

* the `fun`, `is`, `as` and `as?` scopes are gone, and `meta.function.php` now spans a declaration's whole body, so a theme or extension selecting on those scopes sees different tokens.
* `concurrently { }` and `spawn` are no longer highlighted as keywords; the scopes keyword.control.concurrently.phaenon and keyword.control.spawn.phaenon are removed (roadmap D25, concurrency.md §17).

### Features

* concurrently and spawn are plain identifiers ([#4](https://github.com/phaenonlang/vscode/issues/4)) ([328ae16](https://github.com/phaenonlang/vscode/commit/328ae1662f5356a8aa35b83298e2d4cef89600e9))
* methods without a keyword; fun, is and as leave ([30df761](https://github.com/phaenonlang/vscode/commit/30df7613f75893a8e0d15980558ecd3c4ca44c89))

## [0.2.0](https://github.com/phaenonlang/vscode/releases/tag/v0.2.0) (2026-11-06)

The first release, for VS Code 1.91 and newer, with the compiler's 0.2.0.

The TextMate grammar for `.phn`: PHP's, with Phaenon's syntax (generics, `list<T>`, `map<K, V>`,
tuples, closure types, expression bodies and `throws`, `concurrently` and `spawn`) injected. One
`phn lsp` per project, started from the project's own `vendor/bin/phn`, for the compiler's
diagnostics, hover, go to definition, completion, formatting and the build on save. Build, check
and watch as tasks; `phn trace` of the selection or the terminal's text to `.phn` positions.
