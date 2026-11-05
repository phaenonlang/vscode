import * as fs from 'node:fs';
import * as path from 'node:path';

/** What is asked of the file system, so that tests can stand in for it. */
export interface Disk {
    isFile(p: string): boolean;
}

export const disk: Disk = {
    isFile(p) {
        try {
            return fs.statSync(p).isFile();
        } catch {
            return false;
        }
    },
};

/**
 * The directory of the project a file belongs to: the nearest above it with a `phaenon.json`, else
 * with a `composer.json`, the rule `phn lsp` applies to its working directory. Undefined when there
 * is neither, and for installed code ({@link isVendorCode}).
 */
export function projectRoot(file: string, d: Disk = disk): string | undefined {
    if (isVendorCode(file, d)) {
        return undefined;
    }
    for (const marker of ['phaenon.json', 'composer.json']) {
        for (let dir = path.dirname(file); ; ) {
            if (d.isFile(path.join(dir, marker))) {
                return dir;
            }
            const up = path.dirname(dir);
            if (up === dir) {
                break;
            }
            dir = up;
        }
    }
    return undefined;
}

/**
 * Whether a file is installed code: under a `vendor` directory that sits beside a `composer.json`.
 * The project around that directory reads such a file as vendor code. Opened in it, the file would
 * be one of the project's own and declare its classes twice; a server of the package's own would
 * check it without the dependencies, which are installed beside it.
 */
export function isVendorCode(file: string, d: Disk = disk): boolean {
    for (let dir = path.dirname(file); ; ) {
        const up = path.dirname(dir);
        if (up === dir) {
            return false;
        }
        if (path.basename(dir) === 'vendor' && d.isFile(path.join(up, 'composer.json'))) {
            return true;
        }
        dir = up;
    }
}

/**
 * The `phn` to run in a project: the setting; else `$PHN_BINARY`; else the project's
 * `vendor/bin/phn`, the compiler the project builds with (design/tooling.md §6.1); else `phn` on
 * the PATH. Undefined when there is none. The PhpStorm plugin looks in the same order.
 */
export function binary(
    setting: string,
    env: NodeJS.ProcessEnv,
    root: string | undefined,
    platform: NodeJS.Platform = process.platform,
    d: Disk = disk,
): string | undefined {
    const configured = setting.trim();
    if (configured !== '') {
        return configured;
    }
    const fromEnv = env.PHN_BINARY?.trim();
    if (fromEnv) {
        return fromEnv;
    }
    const windows = platform === 'win32';
    if (root !== undefined) {
        const launcher = path.join(root, 'vendor', 'bin', windows ? 'phn.bat' : 'phn');
        if (d.isFile(launcher)) {
            return launcher;
        }
    }
    const name = windows ? 'phn.exe' : 'phn';
    for (const dir of (env.PATH ?? env.Path ?? '').split(path.delimiter)) {
        if (dir !== '' && d.isFile(path.join(dir, name))) {
            return path.join(dir, name);
        }
    }
    return undefined;
}

/** Whether a command must run through a shell: Composer's launcher on Windows is a batch file. */
export function needsShell(command: string): boolean {
    return /\.(?:bat|cmd)$/i.test(command);
}
