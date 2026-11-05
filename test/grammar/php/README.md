# PHP's grammar, pinned for the tests

`php.tmLanguage.json` is the PHP grammar VS Code 1.145.0 ships (`extensions/php`), converted by VS
Code from [KapitanOczywisty/language-php](https://github.com/KapitanOczywisty/language-php) at the
commit its `version` names; `LICENSE.md` is that repository's licence. Phaenon's grammar includes
`source.php`, and the scopes PHP's rules give change between VS Code releases, so the golden
`../constructs.tokens` is written against this copy. The grammar tests also run Phaenon's grammar
against the PHP grammar of every VS Code they find (`../tokenize.ts`).

Refresh it by copying a newer VS Code's file over this one and rewriting the golden
(`PHAENON_UPDATE=1 npm test`), reading the diff of both.
