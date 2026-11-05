import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import { phaenonGrammar, type Tokenized, tokenizer, vscodePhpGrammars } from './tokenize';

const fixtures = path.resolve(__dirname, '../../../test/grammar');
const constructs = () => fs.readFileSync(path.join(fixtures, 'constructs.phn'), 'utf8');

/** One line per source line, then its tokens with their innermost scope; blank lines kept. */
function dump(t: Tokenized): string {
    const out: string[] = [];
    for (const line of t.lines) {
        out.push(line.text === '' ? '' : `> ${line.text}`);
        for (const token of line.tokens) {
            if (token.text.trim() !== '') {
                out.push(`    ${JSON.stringify(token.text).padEnd(24)} ${token.scopes[token.scopes.length - 1]}`);
            }
        }
    }
    out.push(t.closed ? '(every rule closed)' : '(a rule left open)');
    return out.join('\n') + '\n';
}

/** The tokens Phaenon's own rules name, line by line: what does not depend on PHP's grammar. */
function phaenonTokens(t: Tokenized): string[] {
    return t.lines.map((l) =>
        l.tokens
            .filter((k) => k.scopes[k.scopes.length - 1].endsWith('.phaenon'))
            .map((k) => `${k.text}=${k.scopes[k.scopes.length - 1]}`)
            .join(' '),
    );
}

test('the scopes of every Phaenon construct (constructs.tokens; PHAENON_UPDATE=1 rewrites it)', async () => {
    const tokenize = await tokenizer();
    const got = dump(tokenize(constructs()));
    const golden = path.join(fixtures, 'constructs.tokens');
    if (process.env.PHAENON_UPDATE) {
        fs.writeFileSync(golden, got);
    }
    assert.equal(got, fs.readFileSync(golden, 'utf8'));
});

test("the grammar holds with the PHP grammar of each VS Code found", async (t) => {
    const grammars = vscodePhpGrammars();
    if (grammars.length === 0) {
        t.skip('no VS Code found: set PHAENON_PHP_GRAMMAR, or run the e2e tests once');
        return;
    }
    const included = new Set<string>();
    JSON.stringify(JSON.parse(fs.readFileSync(phaenonGrammar, 'utf8')), (key, value) => {
        if (key === 'include' && typeof value === 'string' && value.startsWith('source.php#')) {
            included.add(value.slice('source.php#'.length));
        }
        return value;
    });
    const expected = phaenonTokens((await tokenizer())(constructs()));
    for (const php of grammars) {
        const repository = JSON.parse(fs.readFileSync(php, 'utf8')).repository as Record<string, unknown>;
        for (const rule of included) {
            assert.ok(rule in repository, `${php} has no #${rule}`);
        }
        const tokenized = (await tokenizer(php))(constructs());
        assert.ok(tokenized.closed, `with ${php}, a rule is left open`);
        assert.deepEqual(phaenonTokens(tokenized), expected, `with ${php}`);
    }
});

/**
 * PHAENON_TREES=dir:dir…: every .phn under them ends with no rule open, unless PHP's grammar alone
 * leaves one open there too.
 */
test('whole trees tokenize with every rule closed', { skip: !process.env.PHAENON_TREES && 'PHAENON_TREES unset' }, async () => {
    const tokenize = await tokenizer();
    const plainGrammar = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'phaenon-grammar-')), 'plain.json');
    fs.writeFileSync(plainGrammar, JSON.stringify({ scopeName: 'source.phaenon', patterns: [{ include: 'source.php' }] }));
    const plain = await tokenizer(undefined, 'source.phaenon', plainGrammar);
    const open: string[] = [];
    let files = 0;
    for (const tree of process.env.PHAENON_TREES!.split(path.delimiter)) {
        for (const file of phnFiles(tree)) {
            files++;
            const text = fs.readFileSync(file, 'utf8');
            if (!tokenize(text).closed && plain(text).closed) {
                open.push(file);
            }
        }
    }
    assert.ok(files > 0, 'no .phn found');
    assert.deepEqual(open, [], `${open.length} of ${files} files end inside a rule`);
});

function* phnFiles(dir: string): Generator<string> {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.name === 'vendor' || entry.name === 'node_modules' || entry.name.startsWith('.')) {
            continue;
        }
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            yield* phnFiles(full);
        } else if (entry.name.endsWith('.phn')) {
            yield full;
        }
    }
}
