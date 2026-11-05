import assert from 'node:assert/strict';
import { test } from 'node:test';
import { statusText, statusTooltip } from '../../src/build';

test('a build on save reads in the status bar as in PhpStorm', () => {
    const clean = { files: 800, written: 3, withheld: 0, durationMs: 1061 };
    assert.equal(statusText(clean), 'phn: built');
    assert.equal(statusTooltip(clean), 'Last build on save: 800 files, 3 outputs written (1061 ms)');
    const withheld = { files: 800, written: 0, withheld: 2, durationMs: 990 };
    assert.equal(statusText(withheld), 'phn: 2 of 800 withheld');
    assert.equal(statusTooltip(withheld), 'Last build on save: 800 files, 2 with errors not compiled (990 ms)');
    const failed = { files: 0, written: 0, withheld: 0, durationMs: 5, error: 'no phaenon.json: nothing to build' };
    assert.equal(statusText(failed), 'phn: build failed');
    assert.equal(statusTooltip(failed), 'The last build on save failed: no phaenon.json: nothing to build');
});
