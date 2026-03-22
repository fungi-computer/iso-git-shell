/**
 * FS Adapter: @cloudflare/shell → Isomorphic-Git
 *
 * Wraps @cloudflare/shell's InMemoryFs to match iso-git's expected filesystem interface.
 *
 * Key differences this adapter handles:
 * - iso-git expects methods at top level; InMemoryFs has them there too (good!)
 * - iso-git expects stat/lstat to return { isFile(), isDirectory() }; InMemoryFs returns { type }
 * - iso-git expects readdir to return string[]; InMemoryFs does that
 * - iso-git needs all methods to be bindable via .bind(fs)
 */

import { InMemoryFs, type FileSystem } from "@cloudflare/shell";

/**
 * Stat result shape that iso-git expects
 */
export interface GitStat {
	isFile(): boolean;
	isDirectory(): boolean;
	isSymbolicLink?(): boolean;
	size: number;
	mtime: Date;
	ctime: Date;
	mtimeMs: number;
	ctimeMs: number;
	mtimeSeconds: number;
	mtimeNanoseconds: number;
	ctimeSeconds: number;
	ctimeNanoseconds: number;
	inode: number;
	uid: number;
	gid: number;
	dev: number;
	blksize: number;
	blocks: number;
	mode: number;
}

/**
 * Check if an fs is a "PromiseFs" - meaning it has async methods
 * that return Promises directly (not wrapped in .promises)
 */
export function isPromiseFs(fs: any): fs is FileSystem {
	if (typeof fs !== "object" || fs === null) return false;
	if (typeof fs.readFile !== "function") return false;
	const FN = fs.readFile;
	const isAsync = FN.length < 2;
	return isAsync;
}

/**
 * Wraps @cloudflare/shell's InMemoryFs to match iso-git's expected interface.
 *
 * This class provides an adapter that converts @cloudflare/shell's FileSystem
 * interface (which uses { type: "file" | "directory" }) to iso-git's expected
 * interface (which uses { isFile(), isDirectory() } methods).
 */
export class ShellFsAdapter {
	private fs: FileSystem;

	constructor(fs: FileSystem) {
		this.fs = fs;
	}

	/**
	 * Create an adapter from a new InMemoryFs instance
	 */
	static fromMemory(): ShellFsAdapter {
		return new ShellFsAdapter(new InMemoryFs());
	}

	/**
	 * Check if the underlying fs is a PromiseFs (it should be for InMemoryFs)
	 */
	isPromiseFs(): boolean {
		return isPromiseFs(this.fs);
	}

	/**
	 * Returns this adapter for iso-git compatibility.
	 * iso-git expects fs.promises to exist and point back to the fs.
	 */
	get promises(): ShellFsAdapter {
		return this;
	}

	/**
	 * Verify this adapter works with iso-git by checking the bindFs requirements
	 */
	validateForIsoGit(): { valid: boolean; errors: string[] } {
		const errors: string[] = [];
		const commands = [
			"readFile",
			"writeFile",
			"mkdir",
			"rmdir",
			"unlink",
			"stat",
			"lstat",
			"readdir",
			"readlink",
			"symlink",
		];

		for (const cmd of commands) {
			if (typeof (this.fs as any)[cmd] !== "function") {
				errors.push(`Missing method: ${cmd}`);
			}
		}

		// Check that readFile returns a promise
		if (!isPromiseFs(this.fs)) {
			errors.push("fs.readFile() does not return a Promise");
		}

		return { valid: errors.length === 0, errors };
	}

	async readFile(path?: string, options?: string | { encoding?: string }): Promise<string | Uint8Array> {
		if (path === undefined) {
			return Promise.reject(new Error("path is required"));
		}
		let encoding: string | undefined;
		if (typeof options === "string") {
			encoding = options;
		} else if (options && typeof options === "object") {
			encoding = options.encoding;
		}
		if (encoding === "utf8" || encoding === "utf-8") {
			const result = await this.fs.readFile(path);
			if (typeof result === "string") {
				return result;
			}
			return new TextDecoder("utf-8").decode(result);
		}
		if ("readFileBytes" in this.fs && typeof this.fs.readFileBytes === "function") {
			return this.fs.readFileBytes(path);
		}
		const result = await this.fs.readFile(path);
		if (typeof result === "string") {
			return new TextEncoder().encode(result);
		}
		return result;
	}

	async readFileBytes(path: string): Promise<Uint8Array> {
		if ("readFileBytes" in this.fs && typeof this.fs.readFileBytes === "function") {
			return this.fs.readFileBytes(path);
		}
		const content = await this.fs.readFile(path);
		return new TextEncoder().encode(content);
	}

	async writeFile(path: string, content: string): Promise<void> {
		return this.fs.writeFile(path, content);
	}

	async writeFileBytes(path: string, content: Uint8Array): Promise<void> {
		if ("writeFileBytes" in this.fs && typeof this.fs.writeFileBytes === "function") {
			return this.fs.writeFileBytes(path, content);
		}
		const str = new TextDecoder().decode(content);
		return this.fs.writeFile(path, str);
	}

	async appendFile(path: string, content: string | Uint8Array): Promise<void> {
		if ("appendFile" in this.fs && typeof this.fs.appendFile === "function") {
			return this.fs.appendFile(path, content);
		}
		const existing = await this.fs.readFile(path).catch(() => "");
		const newContent = content instanceof Uint8Array
			? existing + new TextDecoder().decode(content)
			: existing + content;
		return this.fs.writeFile(path, newContent);
	}

	async exists(path: string): Promise<boolean> {
		if ("exists" in this.fs && typeof this.fs.exists === "function") {
			return this.fs.exists(path);
		}
		try {
			await this.fs.stat(path);
			return true;
		} catch {
			return false;
		}
	}

	async stat(path: string): Promise<GitStat> {
		try {
			const stat = await this.fs.stat(path);
			const mtime = stat.mtime instanceof Date ? stat.mtime : new Date(stat.mtime);
			const ctime = mtime;
			const mtimeMs = mtime.valueOf();
			const ctimeMs = ctime.valueOf();
			return {
				isFile: () => stat.type === "file",
				isDirectory: () => stat.type === "directory",
				isSymbolicLink: () => stat.type === "symlink",
				size: stat.size,
				mtime,
				ctime,
				mtimeMs,
				ctimeMs,
				mtimeSeconds: Math.floor(mtimeMs / 1000),
				mtimeNanoseconds: (mtimeMs % 1000) * 1000000,
				ctimeSeconds: Math.floor(ctimeMs / 1000),
				ctimeNanoseconds: (ctimeMs % 1000) * 1000000,
				inode: 0,
				uid: 0,
				gid: 0,
				dev: 0,
				blksize: 4096,
				blocks: Math.ceil(stat.size / 4096),
				mode: stat.type === "directory" ? 0o40755 : 0o100644,
			};
		} catch (err: any) {
			if (err.code === "ENOENT" || err.message?.startsWith("ENOENT")) {
				const notFoundError = Object.assign(
					new Error(`ENOENT: no such file or directory, stat '${path}'`),
					{ code: "ENOENT" }
				);
				throw notFoundError;
			}
			throw err;
		}
	}

	async lstat(path: string): Promise<GitStat> {
		try {
			const stat = await this.fs.lstat(path);
			const mtime = stat.mtime instanceof Date ? stat.mtime : new Date(stat.mtime);
			const ctime = mtime;
			const mtimeMs = mtime.valueOf();
			const ctimeMs = ctime.valueOf();
			return {
				isFile: () => stat.type === "file",
				isDirectory: () => stat.type === "directory",
				isSymbolicLink: () => stat.type === "symlink",
				size: stat.size,
				mtime,
				ctime,
				mtimeMs,
				ctimeMs,
				mtimeSeconds: Math.floor(mtimeMs / 1000),
				mtimeNanoseconds: (mtimeMs % 1000) * 1000000,
				ctimeSeconds: Math.floor(ctimeMs / 1000),
				ctimeNanoseconds: (ctimeMs % 1000) * 1000000,
				inode: 0,
				uid: 0,
				gid: 0,
				dev: 0,
				blksize: 4096,
				blocks: Math.ceil(stat.size / 4096),
				mode: stat.type === "directory" ? 0o40755 : 0o100644,
			};
		} catch (err: any) {
			if (err.code === "ENOENT" || err.message?.startsWith("ENOENT")) {
				const mtime = new Date(0);
				const ctime = new Date(0);
				const mtimeMs = 0;
				const ctimeMs = 0;
				return {
					isFile: () => false,
					isDirectory: () => false,
					isSymbolicLink: () => false,
					size: 0,
					mtime,
					ctime,
					mtimeMs,
					ctimeMs,
					mtimeSeconds: 0,
					mtimeNanoseconds: 0,
					ctimeSeconds: 0,
					ctimeNanoseconds: 0,
					inode: 0,
					uid: 0,
					gid: 0,
					dev: 0,
					blksize: 4096,
					blocks: 0,
					mode: 0,
				};
			}
			throw err;
		}
	}

	async mkdir(path: string, options?: { recursive?: boolean }): Promise<void> {
		if ("mkdir" in this.fs && typeof this.fs.mkdir === "function") {
			return this.fs.mkdir(path, options);
		}
	}

	async readdir(path: string): Promise<string[]> {
		return this.fs.readdir(path);
	}

	async readdirWithFileTypes(path: string): Promise<{ name: string; type: "file" | "directory" | "symlink" }[]> {
		if ("readdirWithFileTypes" in this.fs && typeof this.fs.readdirWithFileTypes === "function") {
			return this.fs.readdirWithFileTypes(path);
		}
		const names = await this.fs.readdir(path);
		const results = [];
		for (const name of names) {
			const fullPath = path.endsWith("/") ? path + name : path + "/" + name;
			try {
				const stat = await this.fs.stat(fullPath);
				results.push({ name, type: stat.type });
			} catch {
				results.push({ name, type: "file" as const });
			}
		}
		return results;
	}

	async rm(path: string, options?: { recursive?: boolean }): Promise<void> {
		try {
			if ("rm" in this.fs && typeof this.fs.rm === "function") {
				return await this.fs.rm(path, options);
			}
			if ("rmdir" in this.fs && typeof this.fs.rmdir === "function") {
				return await this.fs.rmdir(path, { recursive: options?.recursive });
			}
			if ("unlink" in this.fs && typeof this.fs.unlink === "function") {
				return await this.fs.unlink(path);
			}
		} catch (err: any) {
			if (err.code === "ENOENT" || err.message?.startsWith("ENOENT")) {
				return;
			}
			throw err;
		}
	}

	async rmdir(path: string, options?: { recursive?: boolean }): Promise<void> {
		try {
			if ("rmdir" in this.fs && typeof this.fs.rmdir === "function") {
				return await this.fs.rmdir(path, options);
			}
			return await this.rm(path, options);
		} catch (err: any) {
			if (err.code === "ENOENT" || err.message?.startsWith("ENOENT")) {
				return;
			}
			throw err;
		}
	}

	async unlink(path: string): Promise<void> {
		try {
			if ("unlink" in this.fs && typeof this.fs.unlink === "function") {
				return await this.fs.unlink(path);
			}
			return await this.rm(path);
		} catch (err: any) {
			if (err.code === "ENOENT" || err.message?.startsWith("ENOENT")) {
				return;
			}
			throw err;
		}
	}

	async cp(src: string, dest: string, options?: { recursive?: boolean }): Promise<void> {
		if ("cp" in this.fs && typeof this.fs.cp === "function") {
			return this.fs.cp(src, dest, options);
		}
		const content = await this.fs.readFile(src);
		await this.fs.writeFile(dest, content);
	}

	async mv(src: string, dest: string): Promise<void> {
		if ("mv" in this.fs && typeof this.fs.mv === "function") {
			return this.fs.mv(src, dest);
		}
		await this.cp(src, dest);
		await this.rm(src);
	}

	async symlink(target: string, linkPath: string): Promise<void> {
		if ("symlink" in this.fs && typeof this.fs.symlink === "function") {
			return this.fs.symlink(target, linkPath);
		}
	}

	async readlink(path: string): Promise<string> {
		if ("readlink" in this.fs && typeof this.fs.readlink === "function") {
			return this.fs.readlink(path);
		}
		return "";
	}

	async realpath(path: string): Promise<string> {
		if ("realpath" in this.fs && typeof this.fs.realpath === "function") {
			return this.fs.realpath(path);
		}
		return path;
	}

	resolvePath(base: string, path: string): string {
		if ("resolvePath" in this.fs && typeof this.fs.resolvePath === "function") {
			return this.fs.resolvePath(base, path);
		}
		if (path.startsWith("/")) return path;
		if (path.startsWith("./")) return base + path.slice(1);
		if (path.startsWith("../")) {
			const parts = base.split("/");
			parts.pop();
			return this.resolvePath(parts.join("/"), path.slice(3));
		}
		return base + "/" + path;
	}

	async glob(pattern: string): Promise<string[]> {
		if ("glob" in this.fs && typeof this.fs.glob === "function") {
			return this.fs.glob(pattern);
		}
		return [];
	}
}

/**
 * Create a Git-compatible fs adapter from @cloudflare/shell's FileSystem
 */
export function createGitFs(fs: FileSystem): ShellFsAdapter {
	return new ShellFsAdapter(fs);
}

/**
 * Create a Git-compatible fs adapter from a new InMemoryFs instance
 */
export function createMemoryGitFs(): ShellFsAdapter {
	return ShellFsAdapter.fromMemory();
}
