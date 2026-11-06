# Security

## Reporting a vulnerability

Report it privately, through GitHub's private vulnerability reporting: this repository's
**Security** tab, **Report a vulnerability**
(<https://github.com/phaenonlang/vscode/security/advisories/new>). Please do not open a public
issue or pull request for it.

Say what an attacker can do and how to reproduce it: the extension's version, VS Code's, the
compiler's (`phn version`), and a project that shows the problem.

A vulnerability in the compiler, `phn`, which the extension runs as its language server, belongs to
[phaenonlang/phaenon](https://github.com/phaenonlang/phaenon): report it there the same way.

## Scope

The extension runs the project's `vendor/bin/phn`, so opening a workspace can make it run that
workspace's code. It therefore waits for VS Code's workspace trust before it starts the language
server or runs a command, and until then ignores a `phaenon.binary` the workspace sets (a
restricted setting). A way around either is in scope.

## Supported versions

The latest release. Fixes land on `main` and ship in the next release.
