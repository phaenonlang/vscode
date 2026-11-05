import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as vscode from 'vscode';
import type { PhaenonApi } from '../../../src/extension';

const workspace = process.env.PHAENON_E2E_WORKSPACE!;
const app = path.join(workspace, 'app');
const inner = path.join(app, 'packages', 'inner');
const welcome = path.join(app, 'src', 'Welcome.phn');
const greeter = path.join(app, 'src', 'Greeter.phn');

export const tests: { name: string; run: () => Promise<void> }[] = [];

function test(name: string, run: () => Promise<void>): void {
    tests.push({ name, run });
}

async function api(): Promise<PhaenonApi> {
    const extension = vscode.extensions.getExtension<PhaenonApi>('phaenonlang.phaenon');
    assert.ok(extension, 'the extension is installed');
    return extension.activate();
}

async function open(file: string): Promise<vscode.TextDocument> {
    const doc = await vscode.workspace.openTextDocument(file);
    await vscode.window.showTextDocument(doc);
    return doc;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** The probe's first value that is not undefined, asked every 100 ms. */
async function until<T>(what: string, probe: () => T | undefined | Promise<T | undefined>, ms = 30_000): Promise<T> {
    const end = Date.now() + ms;
    for (;;) {
        const value = await probe();
        if (value !== undefined) {
            return value;
        }
        if (Date.now() > end) {
            throw new Error(`timed out waiting for ${what}`);
        }
        await sleep(100);
    }
}

function findings(uri: vscode.Uri, code: string): vscode.Diagnostic[] {
    return vscode.languages
        .getDiagnostics(uri)
        .filter((d) => (typeof d.code === 'object' ? String(d.code.value) : String(d.code)) === code);
}

/** The position `offset` characters into the first `needle` of the document. */
function at(doc: vscode.TextDocument, needle: string, offset = 0): vscode.Position {
    const i = doc.getText().indexOf(needle);
    assert.ok(i >= 0, `${needle} in ${doc.fileName}`);
    return doc.positionAt(i + offset);
}

test('a .phn is Phaenon, served by its project', async () => {
    const doc = await open(welcome);
    assert.equal(doc.languageId, 'phaenon');
    const phaenon = await api();
    assert.equal(phaenon.projectOf(doc.uri), app);
    assert.ok(await phaenon.started(app), "the app's server started");
});

test("the checker's findings are diagnostics", async () => {
    const uri = vscode.Uri.file(welcome);
    const found = await until('P2103', () => {
        const d = findings(uri, 'P2103');
        return d.length > 0 ? d : undefined;
    });
    assert.equal(found.length, 1);
    assert.equal(found[0].range.start.line, 5);
    assert.match(found[0].message, /expects string, 42 given/);
});

test("hover shows the type in Phaenon's spelling", async () => {
    const doc = await open(welcome);
    const hovers = await vscode.commands.executeCommand<vscode.Hover[]>('vscode.executeHoverProvider', doc.uri, at(doc, '$names', 1));
    const text = hovers.flatMap((h) => h.contents.map((c) => (typeof c === 'string' ? c : c.value))).join('\n');
    assert.match(text, /list<string>/);
});

test('go to definition reaches the declaration', async () => {
    const doc = await open(welcome);
    const targets = await vscode.commands.executeCommand<(vscode.Location | vscode.LocationLink)[]>(
        'vscode.executeDefinitionProvider',
        doc.uri,
        at(doc, 'greet(42)'),
    );
    const uris = targets.map((t) => ('targetUri' in t ? t.targetUri : t.uri).fsPath);
    assert.deepEqual(uris, [greeter]);
});

test("completion offers the receiver's members", async () => {
    const doc = await open(welcome);
    const list = await vscode.commands.executeCommand<vscode.CompletionList>(
        'vscode.executeCompletionItemProvider',
        doc.uri,
        at(doc, '$greeter->names', '$greeter->'.length),
    );
    const labels = list.items.map((i) => (typeof i.label === 'string' ? i.label : i.label.label));
    assert.ok(labels.includes('greet') && labels.includes('names'), labels.join(', '));
});

test('signature help names the parameters', async () => {
    const doc = await open(welcome);
    const help = await vscode.commands.executeCommand<vscode.SignatureHelp>(
        'vscode.executeSignatureHelpProvider',
        doc.uri,
        at(doc, 'greet(42)', 'greet('.length),
    );
    assert.match(help.signatures[0].label, /string \$name/);
});

test('document symbols outline the file', async () => {
    const doc = await open(greeter);
    const symbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>('vscode.executeDocumentSymbolProvider', doc.uri);
    const names = symbols.flatMap((s) => [s.name, ...s.children.map((c) => c.name)]);
    assert.ok(names.some((n) => n.includes('Greeter')) && names.some((n) => n.includes('greet')), names.join(', '));
});

test('Format Document is the first layer of phn fmt; saving builds the project', async () => {
    const phaenon = await api();
    const before = phaenon.lastBuild(app);
    const doc = await open(path.join(app, 'src', 'Layout.phn'));
    const edits = await vscode.commands.executeCommand<vscode.TextEdit[]>('vscode.executeFormatDocumentProvider', doc.uri, {
        tabSize: 4,
        insertSpaces: true,
    });
    const edit = new vscode.WorkspaceEdit();
    edit.set(doc.uri, edits);
    assert.ok(await vscode.workspace.applyEdit(edit));
    assert.equal(doc.getText(), 'namespace App;\n\nfun firsts(list<string> $names): list<string> {\n    return $names;\n}\n');

    assert.ok(await doc.save());
    const build = await until('a build on save', () => {
        const b = phaenon.lastBuild(app);
        return b !== before ? b : undefined;
    });
    assert.equal(build.error, undefined);
    assert.equal(build.withheld, 1, 'Welcome.phn, with its error, is withheld');
    assert.ok(fs.existsSync(path.join(app, '.src', 'Greeter.php')));
    assert.ok(!fs.existsSync(path.join(app, '.src', 'Welcome.php')));
    assert.equal(phaenon.status(), `phn: 1 of ${build.files} withheld`);
});

test('with build on save off, a save builds nothing', async () => {
    const phaenon = await api();
    const config = vscode.workspace.getConfiguration('phaenon');
    await config.update('buildOnSave', false, vscode.ConfigurationTarget.Workspace);
    try {
        const before = phaenon.lastBuild(app);
        const doc = await open(greeter);
        const edit = new vscode.WorkspaceEdit();
        edit.insert(doc.uri, new vscode.Position(doc.lineCount - 1, 0), '\n');
        await vscode.workspace.applyEdit(edit);
        await doc.save();
        await sleep(3000);
        assert.equal(phaenon.lastBuild(app), before);
    } finally {
        await config.update('buildOnSave', undefined, vscode.ConfigurationTarget.Workspace);
    }
});

test('a compiled position in the selection traces to the .phn', async () => {
    const compiled = path.join(app, '.src', 'Greeter.php');
    const line = fs.readFileSync(compiled, 'utf8').split('\n').findIndex((l) => l.includes("'Hello, '")) + 1;
    assert.ok(line > 0);
    const doc = await vscode.workspace.openTextDocument({ content: `at ${compiled}:${line}\n`, language: 'plaintext' });
    await vscode.window.showTextDocument(doc);
    const traced = await vscode.commands.executeCommand<string | undefined>('phaenon.traceSelection');
    assert.equal(traced, `at ${greeter}:5\n`);
});

test("a compiled position in the terminal's text traces to the .phn", async () => {
    const compiled = path.join(app, '.src', 'Greeter.php');
    const line = fs.readFileSync(compiled, 'utf8').split('\n').findIndex((l) => l.includes("'Hello, '")) + 1;
    const terminal = vscode.window.createTerminal({ name: 'trace', cwd: app });
    try {
        terminal.show();
        terminal.sendText(`echo at ${compiled}:${line}`);
        await until("the terminal's text, traced", async () => {
            const traced = await vscode.commands.executeCommand<string | undefined>('phaenon.traceTerminal');
            return traced?.includes(`${greeter}:5`) ? traced : undefined;
        });
    } finally {
        terminal.dispose();
    }
});

test('a project inside another has its own server, and its findings show once', async () => {
    const phaenon = await api();
    const uri = vscode.Uri.file(path.join(inner, 'src', 'Inner.phn'));
    await open(uri.fsPath);
    assert.equal(phaenon.projectOf(uri), inner);
    assert.ok(await phaenon.started(inner), "the inner project's server started");
    await until('P2103', () => (findings(uri, 'P2103').length > 0 ? true : undefined));
    // The app's server would publish within the same time, were the file offered to it too.
    await sleep(2000);
    assert.equal(findings(uri, 'P2103').length, 1);
});

test('installed code starts no server', async () => {
    const phaenon = await api();
    const uri = vscode.Uri.file(path.join(app, 'vendor', 'acme', 'lib', 'src', 'Lib.phn'));
    const doc = await open(uri.fsPath);
    assert.equal(doc.languageId, 'phaenon');
    assert.equal(phaenon.projectOf(uri), undefined);
    assert.equal(await phaenon.started(path.join(app, 'vendor', 'acme', 'lib')), false);
});

test('each project has build, check and watch tasks; Check the Project runs one', async () => {
    const tasks = await vscode.tasks.fetchTasks({ type: 'phaenon' });
    assert.deepEqual(tasks.map((t) => t.name).sort(), [
        'build (app)',
        'build (app/packages/inner)',
        'check (app)',
        'check (app/packages/inner)',
        'watch (app)',
        'watch (app/packages/inner)',
    ]);
    const ended = new Promise<vscode.TaskProcessEndEvent>((resolve) => {
        const listener = vscode.tasks.onDidEndTaskProcess((e) => {
            if (e.execution.task.definition.type === 'phaenon') {
                listener.dispose();
                resolve(e);
            }
        });
    });
    await open(welcome);
    await vscode.commands.executeCommand('phaenon.check');
    assert.equal((await ended).exitCode, 1, "phn check fails on Welcome.phn's error");
});
