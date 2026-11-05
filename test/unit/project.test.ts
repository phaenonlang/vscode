import assert from 'node:assert/strict';
import * as path from 'node:path';
import { test } from 'node:test';
import { binary, type Disk, isVendorCode, needsShell, projectRoot } from '../../src/project';

/** A file system holding exactly the files named. */
function diskOf(...files: string[]): Disk {
    const set = new Set(files.map((f) => path.resolve(f)));
    return { isFile: (p) => set.has(path.resolve(p)) };
}

test('the project is the nearest phaenon.json, else the nearest composer.json', () => {
    const d = diskOf('/w/app/phaenon.json', '/w/app/composer.json', '/w/app/packages/x/composer.json', '/w/lib/composer.json');
    assert.equal(projectRoot('/w/app/src/Domain/User.phn', d), '/w/app');
    // A phaenon.json above wins over a nearer composer.json: the server's own rule.
    assert.equal(projectRoot('/w/app/packages/x/src/A.phn', d), '/w/app');
    assert.equal(projectRoot('/w/lib/src/B.phn', d), '/w/lib');
    assert.equal(projectRoot('/elsewhere/C.phn', d), undefined);
});

test('installed code is no project of its own', () => {
    const d = diskOf('/w/app/composer.json', '/w/app/phaenon.json', '/w/app/vendor/acme/lib/phaenon.json');
    assert.ok(isVendorCode('/w/app/vendor/acme/lib/src/A.phn', d));
    assert.equal(projectRoot('/w/app/vendor/acme/lib/src/A.phn', d), undefined);
    // A directory named vendor with no composer.json beside it holds sources like any other.
    const plain = diskOf('/home/vendor/project/phaenon.json');
    assert.ok(!isVendorCode('/home/vendor/project/src/A.phn', plain));
    assert.equal(projectRoot('/home/vendor/project/src/A.phn', plain), '/home/vendor/project');
});

test('the binary is the setting, else $PHN_BINARY, else vendor/bin/phn, else phn on the PATH', () => {
    const d = diskOf('/w/app/vendor/bin/phn', '/usr/local/bin/phn', 'C:/w/app/vendor/bin/phn.bat');
    const env = { PATH: ['/usr/bin', '/usr/local/bin'].join(path.delimiter) };
    assert.equal(binary(' /opt/phn ', { ...env, PHN_BINARY: '/env/phn' }, '/w/app', 'darwin', d), '/opt/phn');
    assert.equal(binary('', { ...env, PHN_BINARY: '/env/phn' }, '/w/app', 'darwin', d), '/env/phn');
    assert.equal(binary('', env, '/w/app', 'darwin', d), path.join('/w/app', 'vendor', 'bin', 'phn'));
    assert.equal(binary('', env, '/w/other', 'darwin', d), path.join('/usr/local/bin', 'phn'));
    assert.equal(binary('', { PATH: '/usr/bin' }, '/w/other', 'darwin', d), undefined);
    assert.equal(binary('', {}, 'C:/w/app', 'win32', d), path.join('C:/w/app', 'vendor', 'bin', 'phn.bat'));
});

test("Composer's launcher on Windows runs through a shell", () => {
    assert.ok(needsShell('C:\\w\\vendor\\bin\\phn.bat'));
    assert.ok(needsShell('phn.CMD'));
    assert.ok(!needsShell('/w/app/vendor/bin/phn'));
});
