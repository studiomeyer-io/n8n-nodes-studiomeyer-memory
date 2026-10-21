import { afterEach, describe, expect, it } from 'vitest';
import { promises as fs } from 'node:fs';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import ts from 'typescript';

let temporary: string | undefined;
afterEach(async () => {
	if (temporary) await fs.rm(temporary, { recursive: true, force: true });
	temporary = undefined;
});

async function fixture(): Promise<{ root: string; helper: string }> {
	const root = await fs.mkdtemp(path.join(os.tmpdir(), 'n8n-copy-icons-'));
	temporary = root;
	await fs.mkdir(path.join(root, 'nodes'), { recursive: true });
	await fs.mkdir(path.join(root, 'credentials'), { recursive: true });
	const source = await fs.readFile(path.resolve(__dirname, '../scripts/copy-icons.ts'), 'utf8');
	const compiled = ts.transpileModule(source, {
		compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
	});
	const helper = path.join(root, 'copy-icons.cjs');
	await fs.writeFile(helper, compiled.outputText);
	return { root, helper };
}

describe('icon build helper', () => {
	it('copies nested node and credential icons with identical bytes and excludes other files', async () => {
		const { root, helper } = await fixture();
		const icons: Record<string, Buffer> = {
			'nodes/Nested/deep/icon.svg': Buffer.from('<svg>nested</svg>'),
			'nodes/Nested/photo.png': Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
			'credentials/Nested/key.svg': Buffer.from('<svg>credential</svg>'),
		};
		const ignored = ['nodes/ignore.txt', 'nodes/UPPER.SVG', 'nodes/.hidden.svg', 'credentials/.dot/hidden.svg'];
		for (const [file, content] of Object.entries(icons)) {
			await fs.mkdir(path.dirname(path.join(root, file)), { recursive: true });
			await fs.writeFile(path.join(root, file), content);
		}
		for (const file of ignored) {
			await fs.mkdir(path.dirname(path.join(root, file)), { recursive: true });
			await fs.writeFile(path.join(root, file), 'ignored');
		}
		const result = spawnSync(process.execPath, [helper], { cwd: root, encoding: 'utf8', timeout: 5000 });
		expect(result.status, result.stderr).toBe(0);
		const entries = await fs.readdir(path.join(root, 'dist'), { recursive: true });
		const files = (await Promise.all(entries.map(async (file) =>
			(await fs.stat(path.join(root, 'dist', file))).isFile() ? file.split(path.sep).join('/') : null,
		))).filter((file): file is string => file !== null);
		expect(files.sort()).toEqual(Object.keys(icons).sort());
		for (const [file, content] of Object.entries(icons)) {
			expect(await fs.readFile(path.join(root, 'dist', file))).toEqual(content);
		}
	});

	it('propagates errors from either source tree as a failing command', async () => {
		const { root, helper } = await fixture();
		await fs.rm(path.join(root, 'credentials'), { recursive: true });
		await fs.writeFile(path.join(root, 'credentials'), 'not a directory');
		const result = spawnSync(process.execPath, [helper], { cwd: root, encoding: 'utf8', timeout: 5000 });
		expect(result.status).toBe(1);
		expect(result.stderr).toMatch(/ENOTDIR/);
	});
});
