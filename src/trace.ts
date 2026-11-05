import { spawn } from 'node:child_process';
import * as path from 'node:path';
import { needsShell } from './project';

/**
 * `phn trace`'s arguments for the `phaenon.traceRoots` setting: `--root PREFIX=LOCAL` for each
 * entry, a relative LOCAL taken from the project's directory.
 */
export function traceArgs(roots: Record<string, string>, project: string): string[] {
    const args = ['trace'];
    for (const [prefix, local] of Object.entries(roots)) {
        args.push('--root', `${prefix}=${path.resolve(project, local)}`);
    }
    return args;
}

/** Runs `phn trace` on a text: the text with its positions in compiled files as `.phn` positions. */
export function runTrace(command: string, args: string[], cwd: string, text: string): Promise<string> {
    return new Promise((resolve, reject) => {
        const child = spawn(command, args, { cwd, shell: needsShell(command) });
        const out: Buffer[] = [];
        const err: Buffer[] = [];
        child.stdout.on('data', (b: Buffer) => out.push(b));
        child.stderr.on('data', (b: Buffer) => err.push(b));
        child.on('error', reject);
        child.on('close', (code) => {
            if (code === 0) {
                resolve(Buffer.concat(out).toString('utf8'));
            } else {
                const message = Buffer.concat(err).toString('utf8').trim();
                reject(new Error(message || `phn trace exited with ${code}`));
            }
        });
        child.stdin.end(text, 'utf8');
    });
}
