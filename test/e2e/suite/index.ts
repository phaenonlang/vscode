import { tests } from './extension.test';

/** The extension host's entry point: runs the tests in order, as many as fail reported at the end. */
export async function run(): Promise<void> {
    const failed: string[] = [];
    for (const t of tests) {
        const started = Date.now();
        try {
            await t.run();
            console.log(`✔ ${t.name} (${Date.now() - started} ms)`);
        } catch (e) {
            failed.push(t.name);
            console.log(`✖ ${t.name}\n${e instanceof Error ? e.stack : String(e)}`);
        }
    }
    console.log(`${tests.length - failed.length} of ${tests.length} passed`);
    if (failed.length > 0) {
        throw new Error(`failed: ${failed.join('; ')}`);
    }
}
