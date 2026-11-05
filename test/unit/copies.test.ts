import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { test } from 'node:test';

const repo = path.resolve(__dirname, '../../..');
const plugin = path.resolve(repo, '../jetbrains/textmate/phaenon');

/**
 * The PhpStorm plugin bundles this grammar and language configuration for the IDEs without the
 * PHP plugin; its files are verbatim copies, refreshed by copying.
 */
test("the PhpStorm plugin's copies of the grammar and the language configuration are current", { skip: !fs.existsSync(plugin) && 'no ../jetbrains checkout' }, () => {
    for (const file of ['syntaxes/phaenon.tmLanguage.json', 'language-configuration.json']) {
        assert.equal(
            fs.readFileSync(path.join(plugin, file), 'utf8'),
            fs.readFileSync(path.join(repo, file), 'utf8'),
            `../jetbrains/textmate/phaenon/${file} is stale: copy ${file} over it`,
        );
    }
});
