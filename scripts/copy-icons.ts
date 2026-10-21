import { copyFile, mkdir, readdir } from 'node:fs/promises';
import path from 'node:path';

async function copyIcons(source: string, destination: string): Promise<void> {
	for (const entry of await readdir(source, { withFileTypes: true })) {
		if (entry.name.startsWith('.')) continue;
		const sourcePath = path.join(source, entry.name);
		const destinationPath = path.join(destination, entry.name);
		if (entry.isDirectory()) {
			await copyIcons(sourcePath, destinationPath);
		} else if (entry.isFile() && ['.png', '.svg'].includes(path.extname(entry.name))) {
			await mkdir(destination, { recursive: true });
			await copyFile(sourcePath, destinationPath);
		}
	}
}

async function main(): Promise<void> {
	await Promise.all(
		['nodes', 'credentials'].map((source) => copyIcons(source, path.join('dist', source))),
	);
}

main().catch((error: unknown) => {
	console.error(error);
	process.exitCode = 1;
});
