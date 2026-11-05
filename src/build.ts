/** The server's own notification `phaenon/build`, sent after each build on save. */
export interface BuildReport {
    files: number;
    written: number;
    /** Files with errors, not compiled (D10). */
    withheld: number;
    durationMs: number;
    error?: string;
}

export const buildNotification = 'phaenon/build';

/** The status bar's text, as the PhpStorm plugin writes it. */
export function statusText(b: BuildReport): string {
    if (b.error) {
        return 'phn: build failed';
    }
    if (b.withheld > 0) {
        return `phn: ${b.withheld} of ${b.files} withheld`;
    }
    return 'phn: built';
}

export function statusTooltip(b: BuildReport): string {
    if (b.error) {
        return `The last build on save failed: ${b.error}`;
    }
    let text = `Last build on save: ${b.files} files`;
    if (b.written > 0) {
        text += `, ${b.written} outputs written`;
    }
    if (b.withheld > 0) {
        text += `, ${b.withheld} with errors not compiled`;
    }
    return `${text} (${b.durationMs} ms)`;
}
