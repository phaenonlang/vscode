import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { runTests } from '@vscode/test-electron';

/**
 * The extension in a real VS Code against a real phn: PHAENON_PHN names the compiler (a build of
 * ../phaenon, `go build -o bin/phn ./cmd/phn`). VS Code is downloaded into .vscode-test: the
 * newest stable release, or PHAENON_VSCODE_VERSION (1.91.0 is the oldest the extension supports);
 * PHAENON_VSCODE runs an installed one instead.
 */
async function main(): Promise<void> {
    const phn = process.env.PHAENON_PHN;
    if (!phn) {
        console.log('PHAENON_PHN unset: the e2e tests are skipped');
        return;
    }
    const repo = path.resolve(__dirname, '../../..');
    const workspace = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'phaenon-e2e-'));
    fs.cpSync(path.join(repo, 'test', 'e2e', 'fixture'), workspace, { recursive: true });
    try {
        await runTests({
            extensionDevelopmentPath: repo,
            extensionTestsPath: path.join(__dirname, 'suite', 'index.js'),
            launchArgs: [
                workspace,
                '--disable-extensions',
                '--disable-workspace-trust',
                '--skip-welcome',
                '--skip-release-notes',
                '--disable-gpu',
            ],
            extensionTestsEnv: { PHN_BINARY: path.resolve(phn), PHAENON_E2E_WORKSPACE: workspace },
            version: process.env.PHAENON_VSCODE_VERSION,
            vscodeExecutablePath: process.env.PHAENON_VSCODE,
        });
    } finally {
        fs.rmSync(workspace, { recursive: true, force: true });
    }
}

main().catch((e: unknown) => {
    console.error(e);
    process.exit(1);
});
