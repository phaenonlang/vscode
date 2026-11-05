import * as fs from 'node:fs';
import * as path from 'node:path';
import * as oniguruma from 'vscode-oniguruma';
import * as textmate from 'vscode-textmate';

const repo = path.resolve(__dirname, '../../..');
export const phaenonGrammar = path.join(repo, 'syntaxes', 'phaenon.tmLanguage.json');

/** The PHP grammar the golden is written against, VS Code 1.145.0's (php/README.md). */
export const pinnedPhpGrammar = path.join(repo, 'test', 'grammar', 'php', 'php.tmLanguage.json');

/**
 * The PHP grammars of the VS Codes on this machine: $PHAENON_PHP_GRAMMAR, those the e2e tests
 * downloaded into .vscode-test, an installed VS Code's.
 */
export function vscodePhpGrammars(): string[] {
    const candidates: string[] = [];
    if (process.env.PHAENON_PHP_GRAMMAR) {
        candidates.push(process.env.PHAENON_PHP_GRAMMAR);
    }
    const tail = path.join('extensions', 'php', 'syntaxes', 'php.tmLanguage.json');
    const downloads = path.join(repo, '.vscode-test');
    if (fs.existsSync(downloads)) {
        for (const dir of fs.readdirSync(downloads)) {
            candidates.push(path.join(downloads, dir, 'Visual Studio Code.app', 'Contents', 'Resources', 'app', tail));
            candidates.push(path.join(downloads, dir, 'resources', 'app', tail));
        }
    }
    candidates.push(path.join('/Applications/Visual Studio Code.app/Contents/Resources/app', tail));
    return candidates.filter((c) => fs.existsSync(c));
}

export interface Token {
    text: string;
    scopes: string[];
}

export interface Tokenized {
    lines: { text: string; tokens: Token[] }[];
    /** Whether the text ends with no rule open: every begin met its end. */
    closed: boolean;
}

export type Tokenizer = (text: string) => Tokenized;

/** A tokenizer of the grammar `scopeName`, with source.php read from `php`. */
export async function tokenizer(php = pinnedPhpGrammar, scopeName = 'source.phaenon', phaenon = phaenonGrammar): Promise<Tokenizer> {
    await loadOniguruma();
    const files: Record<string, string> = { 'source.phaenon': phaenon, 'source.php': php };
    const registry = new textmate.Registry({
        onigLib: Promise.resolve({
            createOnigScanner: (patterns: string[]) => new oniguruma.OnigScanner(patterns),
            createOnigString: (s: string) => new oniguruma.OnigString(s),
        }),
        loadGrammar: async (scope: string) => {
            const file = files[scope];
            return file === undefined ? null : textmate.parseRawGrammar(fs.readFileSync(file, 'utf8'), file);
        },
    });
    const grammar = await registry.loadGrammar(scopeName);
    if (grammar === null) {
        throw new Error(`no grammar ${scopeName}`);
    }
    return (text) => {
        let state = textmate.INITIAL;
        const lines: Tokenized['lines'] = [];
        for (const line of text.split('\n')) {
            const r = grammar.tokenizeLine(line, state);
            state = r.ruleStack;
            lines.push({
                text: line,
                tokens: r.tokens.map((t) => ({ text: line.slice(t.startIndex, t.endIndex), scopes: t.scopes })),
            });
        }
        return { lines, closed: state.depth <= 1 };
    };
}

let loaded: Promise<void> | undefined;

function loadOniguruma(): Promise<void> {
    loaded ??= oniguruma.loadWASM(fs.readFileSync(require.resolve('vscode-oniguruma/release/onig.wasm')).buffer as ArrayBuffer);
    return loaded;
}
