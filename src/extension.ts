import * as path from 'node:path';
import * as vscode from 'vscode';
import {
    DidChangeConfigurationNotification,
    LanguageClient,
    type LanguageClientOptions,
    type Middleware,
    type ServerOptions,
} from 'vscode-languageclient/node';
import { type BuildReport, buildNotification, statusText, statusTooltip } from './build';
import { binary, isVendorCode, needsShell, projectRoot } from './project';
import { runTrace, traceArgs } from './trace';

const language = 'phaenon';

/** What the extension's tests ask of it. */
export interface PhaenonApi {
    /** The project whose server takes a file; undefined for installed code and other schemes. */
    projectOf(uri: vscode.Uri): string | undefined;
    /** Whether a project's server started; false when it failed or there is none. */
    started(root: string): Promise<boolean>;
    /** The last build on save a project's server reported. */
    lastBuild(root: string): BuildReport | undefined;
    /** The status bar item's text while it shows. */
    status(): string | undefined;
}

interface Server {
    client: LanguageClient;
    started: Promise<boolean>;
    build?: BuildReport;
}

export function activate(context: vscode.ExtensionContext): PhaenonApi {
    const phaenon = new Phaenon();
    context.subscriptions.push(phaenon);
    return phaenon;
}

export function deactivate(): void {}

/**
 * One `phn lsp` per project (design/tooling.md §6.1): the server's project is its working
 * directory's, so a workspace with several projects runs several servers. Each client is offered
 * every `.phn` and takes those of its own project ({@link ownedBy}), so a project inside another's
 * directory is served once.
 */
class Phaenon implements PhaenonApi, vscode.Disposable {
    private readonly servers = new Map<string, Server>();
    /** The project of each directory asked about; null: no server takes its files. */
    private readonly roots = new Map<string, string | null>();
    private readonly warned = new Set<string>();
    private readonly output = vscode.window.createOutputChannel('Phaenon', { log: true });
    private readonly traceOutput = vscode.window.createOutputChannel('Phaenon Trace');
    private readonly statusItem = vscode.window.createStatusBarItem('phaenon.build', vscode.StatusBarAlignment.Left);
    private readonly disposables: vscode.Disposable[] = [];
    private statusVisible = false;

    constructor() {
        this.statusItem.name = 'Phaenon Build';
        const markers = vscode.workspace.createFileSystemWatcher('**/{phaenon,composer}.json', false, true, false);
        markers.onDidCreate(() => this.roots.clear());
        markers.onDidDelete(() => this.roots.clear());
        this.disposables.push(
            this.output,
            this.traceOutput,
            this.statusItem,
            markers,
            vscode.workspace.onDidOpenTextDocument((doc) => this.serveDocument(doc)),
            vscode.workspace.onDidGrantWorkspaceTrust(() => this.serveOpenDocuments()),
            vscode.workspace.onDidChangeConfiguration((e) => this.configurationChanged(e)),
            vscode.window.onDidChangeActiveTextEditor(() => this.refreshStatus()),
            vscode.commands.registerCommand('phaenon.build', () => this.runInProject('build')),
            vscode.commands.registerCommand('phaenon.check', () => this.runInProject('check')),
            vscode.commands.registerCommand('phaenon.traceSelection', () => this.traceSelection()),
            vscode.commands.registerCommand('phaenon.traceTerminal', () => this.traceTerminal()),
            vscode.commands.registerCommand('phaenon.restartServer', () => this.restart()),
            vscode.tasks.registerTaskProvider('phaenon', {
                provideTasks: () => this.provideTasks(),
                resolveTask: (task) => this.resolveTask(task),
            }),
        );
        this.serveOpenDocuments();
    }

    dispose(): void {
        void this.stopAll();
        for (const d of this.disposables) {
            d.dispose();
        }
    }

    // ------------------------------------------------------------------ projects and servers

    projectOf(uri: vscode.Uri): string | undefined {
        if (uri.scheme !== 'file') {
            return undefined;
        }
        const file = uri.fsPath;
        const dir = path.dirname(file);
        const known = this.roots.get(dir);
        if (known !== undefined) {
            return known ?? undefined;
        }
        let root: string | undefined;
        if (!isVendorCode(file)) {
            root = projectRoot(file) ?? vscode.workspace.getWorkspaceFolder(uri)?.uri.fsPath ?? dir;
        }
        this.roots.set(dir, root ?? null);
        return root;
    }

    async started(root: string): Promise<boolean> {
        return (await this.servers.get(root)?.started) ?? false;
    }

    lastBuild(root: string): BuildReport | undefined {
        return this.servers.get(root)?.build;
    }

    status(): string | undefined {
        return this.statusVisible ? this.statusItem.text : undefined;
    }

    private serveOpenDocuments(): void {
        for (const doc of vscode.workspace.textDocuments) {
            this.serveDocument(doc);
        }
    }

    private serveDocument(doc: vscode.TextDocument): void {
        if (doc.languageId !== language) {
            return;
        }
        const root = this.projectOf(doc.uri);
        if (root !== undefined) {
            this.serve(root);
        }
    }

    private serve(root: string): Server | undefined {
        const existing = this.servers.get(root);
        if (existing !== undefined) {
            return existing;
        }
        if (!vscode.workspace.isTrusted) {
            return undefined;
        }
        const config = vscode.workspace.getConfiguration('phaenon', vscode.Uri.file(root));
        const command = this.binary(root);
        if (command === undefined) {
            this.warnOnce(root, `No phn found for ${root}: require phaenon/phn with Composer, or set phaenon.binary.`);
            return undefined;
        }
        const serverOptions: ServerOptions = {
            command,
            args: ['lsp'],
            options: { cwd: root, shell: needsShell(command) },
        };
        const clientOptions: LanguageClientOptions = {
            documentSelector: [{ scheme: 'file', language }],
            // The server reads paths relative to its project; rootUri names that project, not
            // the workspace folder around it.
            workspaceFolder: { uri: vscode.Uri.file(root), name: path.basename(root), index: 0 },
            initializationOptions: { buildOnSave: config.get<boolean>('buildOnSave', true) },
            outputChannel: this.output,
            middleware: ownedBy((uri) => this.projectOf(uri) === root),
        };
        const client = new LanguageClient(language, `Phaenon (${path.basename(root)})`, serverOptions, clientOptions);
        const server: Server = { client, started: Promise.resolve(false) };
        client.onNotification(buildNotification, (report: BuildReport) => {
            server.build = report;
            this.refreshStatus();
        });
        server.started = client.start().then(
            () => true,
            (e: unknown) => {
                this.output.error(`phn lsp in ${root}: ${String(e)}`);
                return false;
            },
        );
        this.servers.set(root, server);
        return server;
    }

    private binary(root: string): string | undefined {
        const setting = vscode.workspace.getConfiguration('phaenon', vscode.Uri.file(root)).get<string>('binary', '');
        return binary(setting, process.env, root);
    }

    private warnOnce(key: string, message: string): void {
        if (this.warned.has(key)) {
            return;
        }
        this.warned.add(key);
        void vscode.window.showWarningMessage(message, 'Open Settings').then((choice) => {
            if (choice !== undefined) {
                void vscode.commands.executeCommand('workbench.action.openSettings', 'phaenon.binary');
            }
        });
    }

    private async stopAll(): Promise<void> {
        const servers = [...this.servers.values()];
        this.servers.clear();
        await Promise.all(servers.map((s) => s.client.stop().catch(() => undefined)));
    }

    private async restart(): Promise<void> {
        await this.stopAll();
        this.roots.clear();
        this.warned.clear();
        this.refreshStatus();
        this.serveOpenDocuments();
    }

    private configurationChanged(e: vscode.ConfigurationChangeEvent): void {
        if (e.affectsConfiguration('phaenon.binary')) {
            void this.restart();
            return;
        }
        if (e.affectsConfiguration('phaenon.buildOnSave')) {
            for (const [root, server] of this.servers) {
                const buildOnSave = vscode.workspace
                    .getConfiguration('phaenon', vscode.Uri.file(root))
                    .get<boolean>('buildOnSave', true);
                void server.client.sendNotification(DidChangeConfigurationNotification.type, {
                    settings: { phaenon: { buildOnSave } },
                });
            }
        }
    }

    // ------------------------------------------------------------------ status bar

    /** The last build on save of the active editor's project. */
    private refreshStatus(): void {
        const doc = vscode.window.activeTextEditor?.document;
        const root = doc?.languageId === language ? this.projectOf(doc.uri) : undefined;
        const build = root !== undefined ? this.servers.get(root)?.build : undefined;
        if (build === undefined) {
            this.statusItem.hide();
            this.statusVisible = false;
            return;
        }
        this.statusItem.text = statusText(build);
        this.statusItem.tooltip = statusTooltip(build);
        this.statusItem.backgroundColor =
            build.error || build.withheld > 0 ? new vscode.ThemeColor('statusBarItem.warningBackground') : undefined;
        this.statusItem.show();
        this.statusVisible = true;
    }

    // ------------------------------------------------------------------ build, check, watch

    /** The projects of the workspace: each phaenon.json outside installed code. */
    private async projects(): Promise<string[]> {
        const files = await vscode.workspace.findFiles('**/phaenon.json', '**/{vendor,node_modules}/**');
        return [...new Set(files.map((f) => path.dirname(f.fsPath)))].sort();
    }

    /** The active editor's project, else the workspace's only one, else the one picked. */
    private async pickProject(): Promise<string | undefined> {
        const doc = vscode.window.activeTextEditor?.document;
        const fromEditor = doc !== undefined ? this.projectOf(doc.uri) : undefined;
        if (fromEditor !== undefined) {
            return fromEditor;
        }
        const projects = await this.projects();
        if (projects.length <= 1) {
            return projects[0] ?? vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        }
        return vscode.window.showQuickPick(projects, { placeHolder: 'The Phaenon project' });
    }

    private async runInProject(command: 'build' | 'check'): Promise<void> {
        if (!vscode.workspace.isTrusted) {
            void vscode.window.showWarningMessage('phn runs once the workspace is trusted.');
            return;
        }
        const root = await this.pickProject();
        const task = root !== undefined ? this.task(root, { type: 'phaenon', command }) : undefined;
        if (task !== undefined) {
            await vscode.tasks.executeTask(task);
        }
    }

    private task(root: string, definition: PhaenonTaskDefinition, base?: vscode.Task): vscode.Task | undefined {
        const command = this.binary(root);
        if (command === undefined) {
            this.warnOnce(root, `No phn found for ${root}: require phaenon/phn with Composer, or set phaenon.binary.`);
            return undefined;
        }
        const folder = vscode.workspace.getWorkspaceFolder(vscode.Uri.file(root));
        const label = folder !== undefined && folder.uri.fsPath !== root ? path.relative(folder.uri.fsPath, root) : '';
        const execution = new vscode.ProcessExecution(command, [definition.command, ...(definition.args ?? [])], {
            cwd: root,
        });
        const task = new vscode.Task(
            base?.definition ?? definition,
            base?.scope ?? folder ?? vscode.TaskScope.Workspace,
            base?.name ?? (label !== '' ? `${definition.command} (${label})` : definition.command),
            'phn',
            execution,
            [],
        );
        task.presentationOptions = { reveal: vscode.TaskRevealKind.Always, clear: true };
        if (definition.command === 'build') {
            task.group = vscode.TaskGroup.Build;
        }
        if (definition.command === 'watch') {
            task.isBackground = true;
        }
        return task;
    }

    private async provideTasks(): Promise<vscode.Task[]> {
        if (!vscode.workspace.isTrusted) {
            return [];
        }
        const tasks: vscode.Task[] = [];
        for (const root of await this.projects()) {
            for (const command of ['build', 'check', 'watch'] as const) {
                const task = this.task(root, { type: 'phaenon', command });
                if (task !== undefined) {
                    tasks.push(task);
                }
            }
        }
        return tasks;
    }

    /** A task of tasks.json: its project is `project` under its workspace folder, else the folder. */
    private resolveTask(task: vscode.Task): vscode.Task | undefined {
        const definition = task.definition as PhaenonTaskDefinition;
        const folder = typeof task.scope === 'object' ? task.scope : vscode.workspace.workspaceFolders?.[0];
        if (folder === undefined || !vscode.workspace.isTrusted) {
            return undefined;
        }
        const root = path.resolve(folder.uri.fsPath, definition.project ?? '.');
        return this.task(root, definition, task);
    }

    // ------------------------------------------------------------------ phn trace

    /** The selection, or the whole document without one, through phn trace. */
    private async traceSelection(): Promise<string | undefined> {
        const editor = vscode.window.activeTextEditor;
        if (editor === undefined) {
            return undefined;
        }
        const text = editor.selections
            .filter((s) => !s.isEmpty)
            .map((s) => editor.document.getText(s))
            .join('\n');
        return this.trace(text !== '' ? text : editor.document.getText());
    }

    /** The terminal's selection, or its whole buffer without one, through phn trace. */
    private async traceTerminal(): Promise<string | undefined> {
        if (vscode.window.activeTerminal === undefined) {
            return undefined;
        }
        return this.trace(await terminalText());
    }

    private async trace(text: string): Promise<string | undefined> {
        if (!vscode.workspace.isTrusted) {
            void vscode.window.showWarningMessage('phn runs once the workspace is trusted.');
            return undefined;
        }
        const doc = vscode.window.activeTextEditor?.document;
        const root =
            (doc !== undefined ? this.projectOf(doc.uri) : undefined) ??
            (await this.projects())[0] ??
            vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (root === undefined) {
            return undefined;
        }
        const command = this.binary(root);
        if (command === undefined) {
            this.warnOnce(root, `No phn found for ${root}: require phaenon/phn with Composer, or set phaenon.binary.`);
            return undefined;
        }
        const roots = vscode.workspace
            .getConfiguration('phaenon', vscode.Uri.file(root))
            .get<Record<string, string>>('traceRoots', {});
        try {
            const traced = await runTrace(command, traceArgs(roots, root), root, text);
            this.traceOutput.clear();
            this.traceOutput.append(traced);
            this.traceOutput.show(true);
            return traced;
        } catch (e) {
            void vscode.window.showErrorMessage(`phn trace: ${e instanceof Error ? e.message : String(e)}`);
            return undefined;
        }
    }
}

interface PhaenonTaskDefinition extends vscode.TaskDefinition {
    command: 'build' | 'check' | 'watch';
    args?: string[];
    project?: string;
}

/**
 * The middleware of a client that serves only the documents `owns` accepts: every client is
 * offered every `.phn`, and the documents of another project, a nested one included, or of
 * installed code never reach it.
 */
export function ownedBy(owns: (uri: vscode.Uri) => boolean): Middleware {
    return {
        didOpen: (doc, next) => (owns(doc.uri) ? next(doc) : Promise.resolve()),
        didChange: (e, next) => (owns(e.document.uri) ? next(e) : Promise.resolve()),
        willSave: (e, next) => (owns(e.document.uri) ? next(e) : Promise.resolve()),
        willSaveWaitUntil: (e, next) => (owns(e.document.uri) ? next(e) : Promise.resolve([])),
        didSave: (doc, next) => (owns(doc.uri) ? next(doc) : Promise.resolve()),
        didClose: (doc, next) => (owns(doc.uri) ? next(doc) : Promise.resolve()),
        handleDiagnostics: (uri, diagnostics, next) => {
            if (owns(uri)) {
                next(uri, diagnostics);
            }
        },
        provideHover: (doc, pos, token, next) => (owns(doc.uri) ? next(doc, pos, token) : undefined),
        provideDefinition: (doc, pos, token, next) => (owns(doc.uri) ? next(doc, pos, token) : undefined),
        provideDocumentSymbols: (doc, token, next) => (owns(doc.uri) ? next(doc, token) : undefined),
        provideCompletionItem: (doc, pos, ctx, token, next) => (owns(doc.uri) ? next(doc, pos, ctx, token) : undefined),
        provideSignatureHelp: (doc, pos, ctx, token, next) => (owns(doc.uri) ? next(doc, pos, ctx, token) : undefined),
        provideDocumentFormattingEdits: (doc, options, token, next) =>
            owns(doc.uri) ? next(doc, options, token) : undefined,
        provideCodeActions: (doc, range, ctx, token, next) => (owns(doc.uri) ? next(doc, range, ctx, token) : undefined),
    };
}

/**
 * The active terminal's selection, or its whole buffer: VS Code gives an extension a terminal's
 * text only through the clipboard, whose text is put back afterwards.
 */
async function terminalText(): Promise<string> {
    const saved = await vscode.env.clipboard.readText();
    try {
        await vscode.env.clipboard.writeText('');
        await vscode.commands.executeCommand('workbench.action.terminal.copySelection');
        let text = await vscode.env.clipboard.readText();
        if (text === '') {
            await vscode.commands.executeCommand('workbench.action.terminal.selectAll');
            await vscode.commands.executeCommand('workbench.action.terminal.copySelection');
            await vscode.commands.executeCommand('workbench.action.terminal.clearSelection');
            text = await vscode.env.clipboard.readText();
        }
        return text;
    } finally {
        await vscode.env.clipboard.writeText(saved);
    }
}
