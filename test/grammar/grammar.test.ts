import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import { phaenonGrammar, type Tokenized, tokenizer, vscodePhpGrammars } from './tokenize';

const fixtures = path.resolve(__dirname, '../../../test/grammar');
const constructs = () => fs.readFileSync(path.join(fixtures, 'constructs.phn'), 'utf8');
const shapes = () => fs.readFileSync(path.join(fixtures, 'shapes.phn'), 'utf8');

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

for (const [name, about] of [
    ['constructs', 'every Phaenon construct'],
    ['shapes', 'named shapes, and the bodies after a return type of array'],
]) {
    test(`the scopes of ${about} (${name}.tokens; PHAENON_UPDATE=1 rewrites it)`, async () => {
        const tokenize = await tokenizer();
        const got = dump(tokenize(fs.readFileSync(path.join(fixtures, `${name}.phn`), 'utf8')));
        const golden = path.join(fixtures, `${name}.tokens`);
        if (process.env.PHAENON_UPDATE) {
            fs.writeFileSync(golden, got);
        }
        assert.equal(got, fs.readFileSync(golden, 'utf8'));
    });
}

test('concurrently and spawn are names like any other: PHP scopes their declarations and calls', async () => {
    const tokenize = await tokenizer();
    const words = (text: string) =>
        tokenize(text)
            .lines.flatMap((l) => l.tokens)
            .filter((k) => k.text === 'concurrently' || k.text === 'spawn')
            .map((k) => `${k.text}=${k.scopes[k.scopes.length - 1]}`);

    assert.deepEqual(words(constructs()).filter((w) => w.endsWith('.phaenon')), []);
    assert.deepEqual(
        words('function spawn(string $url): string {\n    return concurrently([spawn($url)]);\n}\n'),
        ['spawn=entity.name.function.php', 'concurrently=entity.name.function.php', 'spawn=entity.name.function.php'],
    );
});

/** The names of declarations and calls: a declaration's name sits right inside meta.function.php. */
function functionNames(t: Tokenized): { declared: string[]; called: string[] } {
    const declared: string[] = [];
    const called: string[] = [];
    for (const k of t.lines.flatMap((l) => l.tokens)) {
        const innermost = k.scopes[k.scopes.length - 1];
        if (innermost === 'entity.name.function.php' || innermost.startsWith('support.function.')) {
            (k.scopes[k.scopes.length - 2] === 'meta.function.php' ? declared : called).push(k.text);
        }
    }
    return { declared, called };
}

test('a name and its parameters declare a method at class-member level, and call a function everywhere else', async () => {
    const tokenize = await tokenizer();
    const { declared, called } = functionNames(tokenize(constructs()));
    assert.deepEqual(declared, [
        'map', 'get',
        '__construct', 'first', 'with', 'pairs', 'factory', 'kubectl', 'all', 'load', 'text', 'check', 'of', 'dispatch',
        'reference', 'shared', 'count', 'list', 'new', 'static', 'var', 'const', 'Closure', 'legacy', 'anonymous',
        '__construct', 'inner',
        'count', 'render',
        'case', 'label',
        'headline', 'spawn', 'fetchAll', 'plain',
    ]);
    for (const name of ['process', 'helper', 'random_bytes', 'mb_check_encoding', 'is_array', 'array_is_list', 'is_int', 'fun', 'is']) {
        assert.ok(called.includes(name), `${name} is called`);
    }
    assert.ok(!declared.includes('set'), "the hook set(…) is PHP's, no method");
});

test('a call in a method body, a property hook and a property of any type are no method', async () => {
    const tokenize = await tokenizer();
    const { declared, called } = functionNames(
        tokenize(
            [
                'final class A',
                '{',
                '    public static (A&B)|null $x = null;',
                '    var (A&B)|null $y;',
                '    const (A&B)|null C = null;',
                '    public Closure(int): string $f;',
                '    private (int, string) $pair;',
                '    final const F = strlen(...);',
                '    public string $name {',
                '        get => format($this->name);',
                '        set(string $value) {',
                '            $this->name = $value;',
                '        }',
                '    }',
                '    run(): void {',
                '        prepare();',
                '        $this->send(build());',
                '    }',
                '    after(): void => finish();',
                '}',
                '',
            ].join('\n'),
        ),
    );
    assert.deepEqual(declared, ['run', 'after']);
    assert.deepEqual(called, ['strlen', 'format', 'set', 'prepare', 'send', 'build', 'finish']);
});

test('a generic method at column 0 is declared, and a generic call at column 0 in a body stays a call', async () => {
    const tokenize = await tokenizer();
    const t = tokenize(
        [
            'class A',
            '{',
            'first<T>(T $x): T => $x;',
            'static &pairs<K, V of Closure(K): bool>(map<K, V> $m): void {}',
            '    public string $name {',
            '        set(string $value) { $this->name = $value; }',
            '        final set(string $v) => trim($v);',
            '    }',
            '    run(): void {',
            'first<int>(1);',
            '    }',
            '}',
            'interface I',
            '{',
            'map<T>(T $x): T;',
            '}',
            'first<int>(2);',
            '',
        ].join('\n'),
    );
    assert.ok(t.closed, 'a rule is left open');
    const { declared, called } = functionNames(t);
    assert.deepEqual(declared, ['first', 'pairs', 'run', 'map']);
    assert.deepEqual(called, ['set', 'set', 'trim', 'first', 'first']);
});

test('a class named Enum in a header is a name: extends Enum implements … begins no enum', async () => {
    const tokenize = await tokenizer();
    const t = tokenize(
        [
            'final class Status extends Enum implements JsonSerializable',
            '{',
            "    label(): string => 'x';",
            '}',
            '',
            'class Code extends Base implements Countable, Enum',
            '{',
            '    count(): int => 0;',
            '}',
            '',
            'function after(): void {}',
            '',
        ].join('\n'),
    );
    assert.ok(t.closed, 'a rule is left open');
    assert.deepEqual(functionNames(t).declared, ['label', 'count', 'after']);
    const enums = t.lines.flatMap((l) => l.tokens).filter((k) => k.text === 'Enum');
    assert.deepEqual(enums.map((k) => k.scopes[k.scopes.length - 1]), ['entity.other.inherited-class.php', 'entity.other.inherited-class.php']);
});

test("fun, is and as are PHP's: no Phaenon scope, and no keyword", async () => {
    const tokenize = await tokenizer();
    const words = tokenize(constructs())
        .lines.flatMap((l) => l.tokens)
        .filter((k) => ['fun', 'is', 'as', 'as?'].includes(k.text.trim()))
        .map((k) => `${k.text}=${k.scopes[k.scopes.length - 1]}`);
    assert.deepEqual(words.filter((w) => w.endsWith('.phaenon') || w.startsWith('fun=storage.type')), []);
    assert.ok(words.includes('as=keyword.operator.as.php'), words.join(' '));
    assert.deepEqual(functionNames(tokenize("final class A\n{\n    fun greet(): string => 'hi';\n}\n")).declared, []);
});

test('outside a type declaration a brace after array opens the body, in every form a return type takes', async () => {
    const tokenize = await tokenizer();
    const t = tokenize(shapes());
    assert.ok(t.closed, 'a rule is left open');
    const bodies = t.lines.slice(t.lines.findIndex((l) => l.text.startsWith('function rows(')));
    const { declared } = functionNames({ lines: bodies, closed: t.closed });
    assert.deepEqual(declared, [
        'rows', 'next', 'tight', 'commented', 'noted', 'either', 'generic', 'thrown',
        'all', 'find', 'legacy',
        'load', 'all', 'find', 'legacy', 'make', 'none', 'first', 'anonymous', 'rows',
        'labels',
    ]);
    // A body's brace for each declaration with one, the two closures' among them: all but the
    // interface's three, the abstract load and the arrow of first.
    const braces = bodies
        .flatMap((l) => l.tokens)
        .filter((k) => k.text === '{')
        .map((k) => k.scopes[k.scopes.length - 1]);
    assert.equal(braces.filter((s) => s === 'punctuation.definition.begin.bracket.curly.php').length, declared.length - 5 + 2);
    assert.deepEqual(braces.filter((s) => !s.endsWith('.php')), []);
});

test('bytes is the type in a type position, and a name before a colon', async () => {
    const tokenize = await tokenizer();
    const words = (text: string) =>
        tokenize(text)
            .lines.flatMap((l) => l.tokens)
            .filter((k) => k.text === 'bytes' || k.text === ':')
            .map((k) => `${k.text}=${k.scopes[k.scopes.length - 1]}`);
    const type = 'bytes=keyword.other.type.phaenon';

    assert.deepEqual(words('function f(bytes $b, ?bytes $c, Closure(bytes): bytes $d): bytes {\n    return (bytes) $b;\n}\n'), [
        type, type, type,
        ':=keyword.operator.return-value.php', type,
        ':=keyword.operator.return-value.php', type,
        type,
    ]);
    assert.deepEqual(words('$x = encode(bytes: $raw, length: 3);\n'), [
        'bytes=entity.name.variable.parameter.php', ':=punctuation.separator.colon.php',
        ':=punctuation.separator.colon.php',
    ]);
});

test('a bracket a type opens and leaves unclosed ends at the ; of its declaration', async () => {
    const tokenize = await tokenizer();
    const after = 'function after(): array {\n    return [];\n}\n';
    const alone = tokenize(after).lines.map((l) => l.tokens.map((k) => `${k.text}=${k.scopes.slice(1).join(' ')}`));
    for (const typed of ['type F = Closure(int: int;', 'type M = map<string, list<int>;', 'type P<T = int;', 'type D = (A&B|null;']) {
        const t = tokenize(`${typed}\n${after}`);
        assert.ok(t.closed, `after ${typed}, a rule is left open`);
        assert.deepEqual(
            t.lines.slice(1).map((l) => l.tokens.map((k) => `${k.text}=${k.scopes.slice(1).join(' ')}`)),
            alone,
            `after ${typed}`,
        );
    }
});

test('a shape is read in a type declaration only: elsewhere array { is what PHP makes of it', async () => {
    const tokenize = await tokenizer();
    const shaped = (text: string) =>
        tokenize(text)
            .lines.flatMap((l) => l.tokens)
            .filter((k) => k.text.trim() !== '' && k.scopes.some((s) => s.includes('.shape.')))
            .map((k) => k.text);

    assert.deepEqual(shaped(shapes().slice(shapes().indexOf('function rows('))), []);
    for (const text of [
        'function f(): array{id: int} {}\n',
        'final class A\n{\n    find(): array{id: int} {}\n}\n',
        '$f = fn(): array => [\'id\' => 1];\n',
        '/** @return array{id: int} */\nfunction g(): array {}\n',
        "// type Row = array{id: int};\n$s = 'type Row = array{id: int};';\n",
    ]) {
        assert.deepEqual(shaped(text), [], text);
    }
    assert.deepEqual(shaped('type Row = array{id: int};\n'), ['array', '{', 'id', ':', 'int', '}']);
});

test('a half-typed shape ends at the ; of its declaration, and the declarations after it read as they do alone', async () => {
    const tokenize = await tokenizer();
    const after = [
        '',
        '/** The next declarations. */',
        'function after(): array {',
        '    return [];',
        '}',
        '',
        'final class Orders',
        '{',
        '    find(int $id): array',
        '    {',
        '        return [];',
        '    }',
        '}',
        '',
    ].join('\n');
    const scopes = (lines: Tokenized['lines'], innermost: boolean) =>
        lines.map((l) =>
            l.tokens
                .filter((k) => k.text.trim() !== '')
                .map((k) => `${k.text}=${innermost ? k.scopes[k.scopes.length - 1] : k.scopes.slice(1).join(' ')}`),
        );
    const alone = tokenize(after).lines;

    // With its ;, a declaration ends there, whatever it left open, and what follows is untouched.
    for (const typed of [
        'type Row = array{id: int;',
        'type Row = array{id: int, lines: list<array{sku: string>;',
        'type Row = array{step: Closure(array{a: int): int};',
        "type Row = array{'a-b: int};",
        'type Row = array{\n    id: int,\n    name?: string,\n;',
        'type Page<T = array{x: int};',
    ]) {
        const t = tokenize(`${typed}\n${after}`);
        assert.ok(t.closed, `after ${typed}, a rule is left open`);
        assert.deepEqual(scopes(t.lines.slice(typed.split('\n').length), false), scopes(alone, false), typed);
    }
    // Without one, the declaration stays open, and the declarations after it are read inside it as
    // they are alone: a function's or a method's array { is its body.
    for (const typed of ['type Row = array{', 'type Row = array{id: int, name?: string', 'type Row = array{\n    id: int,\n    lines: list<array{']) {
        const t = tokenize(`${typed}\n${after}`);
        assert.deepEqual(scopes(t.lines.slice(typed.split('\n').length), true), scopes(alone, true), typed);
    }
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
    const pinned = await tokenizer();
    for (const php of grammars) {
        const repository = JSON.parse(fs.readFileSync(php, 'utf8')).repository as Record<string, unknown>;
        for (const rule of included) {
            assert.ok(rule in repository, `${php} has no #${rule}`);
        }
        const tokenize = await tokenizer(php);
        for (const [name, text] of [['constructs.phn', constructs()], ['shapes.phn', shapes()]]) {
            const tokenized = tokenize(text);
            assert.ok(tokenized.closed, `${name} with ${php}: a rule is left open`);
            assert.deepEqual(phaenonTokens(tokenized), phaenonTokens(pinned(text)), `${name} with ${php}`);
        }
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
