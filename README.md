# Phaenon for VS Code

VS Code support for [Phaenon](https://github.com/phaenonlang) source files (`.phn`), a typed dialect
of PHP that compiles to PHP.

A Phaenon file is PHP code from the first byte: no `<?php` open tag, no inline HTML. The extension
highlights it with VS Code's PHP grammar plus Phaenon's syntax, and runs the project's compiler as
its language server, `phn lsp`. VS Code has no PHP engine of its own for `.phn`, so everything beyond
highlighting comes from the compiler:

| Feature | From `phn lsp` |
|---|---|
| Diagnostics | the checker's codes and messages, with "declared here" as related information; the tabs quick-fix |
| Hover | the type in Phaenon's spelling (`map<string, User>`, `class<T>`, `(int, string)`), and the docblock |
| Go to definition | into `.phn`, vendor `.php` and PHP's stubs |
| Outline | the file's declarations |
| Completion | members; names in scope; classes with their `use`; after `\|>`, the functions that take the left side |
| Signature help | the parameters of the call being typed |
| Format Document | `phn fmt`'s first layer, Phaenon's layout |
| Build on save | the project's outputs written after each save, as `phn build` writes them; files with errors withheld |

The status bar shows the last build on save of the active editor's project.

## Requirements

The project requires the compiler through Composer, `composer require phaenon/phn`, and the
extension runs that `vendor/bin/phn`, so a project is checked with the compiler it builds with. The
`phaenon.binary` setting names another; without it the extension also tries `$PHN_BINARY`, then
`phn` on the PATH. `php` must be on the PATH: the compiler asks it which extensions are loaded.

The highlighting includes VS Code's built-in PHP grammar (the `vscode.php` extension).

## Projects

A file belongs to the project of the nearest `phaenon.json` above it, else of the nearest
`composer.json`, and each project gets its own server: a workspace holding several projects, or a
project inside another's directory, works as several. A `.phn` of installed code, under a project's
`vendor/`, is highlighted only: the project around it reads it as vendor code.

## Commands and tasks

- **Phaenon: Build the Project** and **Phaenon: Check the Project** run `phn build` / `phn check` in
  the active editor's project, as tasks. **Tasks: Run Task → phn** lists `build`, `check` and `watch`
  for every project; in `tasks.json`: `{"type": "phaenon", "command": "watch", "project": "app"}`.
- **Phaenon: Trace the Selection to .phn Positions** runs `phn trace` on the selection (the whole
  document without one) and shows the text with every position in a compiled file (a stack trace, a
  PHPUnit failure, a PHPStan finding) as the `.phn` position. **Trace the Terminal's Text** does it for
  the terminal's selection, else its whole buffer, also from the terminal's context menu. VS Code
  hands an extension a terminal's text only through the clipboard; its text is put back afterwards.
- **Phaenon: Restart the Language Server**, after a `composer install` that changed the compiler.

## Settings

| Setting | Default | |
|---|---|---|
| `phaenon.binary` | empty | The `phn` to run |
| `phaenon.buildOnSave` | `true` | Build the project after each save |
| `phaenon.traceRoots` | `{}` | For the trace commands: paths under each key are read from its value, `phn trace --root PREFIX=LOCAL`, e.g. `{"/app": "."}` for a trace from a container |
| `phaenon.trace.server` | `off` | Log the messages with the server in the Phaenon output |

In an untrusted workspace the extension highlights only: the server and the commands run the
project's `vendor/bin/phn`, so they wait for the workspace to be trusted.

## Not yet

Debugging: vscode-php-debug maps directories, not files with another extension, so a breakpoint in a
`.phn` needs a debug adapter that maps positions through the line map. PhpStorm has this today.

## Installing

Until the repositories are public, the extension ships as a `.vsix`: **Extensions → … → Install
from VSIX…**, or `code --install-extension phaenon-<version>.vsix`.

## Development

```sh
npm install
npm test                                     # unit and grammar tests
PHAENON_PHN=../phaenon/bin/phn npm run test:e2e   # in a real VS Code, against a real phn
npm run package                              # → phaenon-<version>.vsix
```

`AGENTS.md` has the layout and the tests' variables.
