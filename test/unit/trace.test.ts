import assert from 'node:assert/strict';
import * as path from 'node:path';
import { test } from 'node:test';
import { runTrace, traceArgs } from '../../src/trace';

test('each trace root is a --root PREFIX=LOCAL, a relative LOCAL from the project', () => {
    assert.deepEqual(traceArgs({}, '/w/app'), ['trace']);
    assert.deepEqual(traceArgs({ '/app': '.', '/srv/lib': '/w/lib' }, '/w/app'), [
        'trace',
        '--root',
        `/app=${path.resolve('/w/app')}`,
        '--root',
        `/srv/lib=${path.resolve('/w/lib')}`,
    ]);
});

test('the text goes in on stdin and comes back from stdout', async () => {
    const echo = ['-e', 'process.stdin.pipe(process.stdout)'];
    assert.equal(await runTrace(process.execPath, echo, process.cwd(), 'at /app/.src/A.php:12\n'), 'at /app/.src/A.php:12\n');
});

test('a failing run reports its standard error', async () => {
    const fail = ['-e', 'process.stderr.write("no line map\\n"); process.exit(3)'];
    await assert.rejects(runTrace(process.execPath, fail, process.cwd(), ''), /no line map/);
});
