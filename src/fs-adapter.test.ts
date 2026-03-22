import { describe, it, expect, beforeEach } from "vitest";
import { InMemoryFs } from "@cloudflare/shell";
import { ShellFsAdapter, createGitFs, createMemoryGitFs, isPromiseFs } from "./fs-adapter.js";

describe("ShellFsAdapter", () => {
	let adapter: ShellFsAdapter;
	let fs: InMemoryFs;

	beforeEach(() => {
		fs = new InMemoryFs();
		adapter = createGitFs(fs);
	});

	describe("basic properties", () => {
		it("should create from InMemoryFs", () => {
			expect(adapter).toBeInstanceOf(ShellFsAdapter);
		});

		it("should create from factory function", () => {
			const a = createMemoryGitFs();
			expect(a).toBeInstanceOf(ShellFsAdapter);
		});

		it("should report isPromiseFs status", () => {
			expect(adapter.isPromiseFs()).toBe(false);
		});
	});

	describe("readFile", () => {
		it("should read file that exists as binary", async () => {
			await fs.writeFile("/test.txt", "hello world");
			const content = await adapter.readFile("/test.txt");
			expect(content).toBeInstanceOf(Uint8Array);
			expect(new TextDecoder().decode(content as Uint8Array)).toBe("hello world");
		});

		it("should throw for non-existent file", async () => {
			await expect(adapter.readFile("/nonexistent.txt")).rejects.toThrow();
		});
	});

	describe("writeFile", () => {
		it("should write string content", async () => {
			await adapter.writeFile("/test.txt", "hello");
			const content = await fs.readFile("/test.txt");
			expect(content).toBe("hello");
		});

		it("should overwrite existing content", async () => {
			await adapter.writeFile("/test.txt", "first");
			await adapter.writeFile("/test.txt", "second");
			const content = await fs.readFile("/test.txt");
			expect(content).toBe("second");
		});
	});

	describe("writeFileBytes", () => {
		it("should write binary content", async () => {
			const data = new Uint8Array([72, 101, 108, 108, 111]); // "Hello"
			await adapter.writeFileBytes("/binary.bin", data);

			const bytes = await fs.readFileBytes("/binary.bin");
			expect(bytes).toEqual(data);
		});
	});

	describe("stat", () => {
		it("should return stat with isFile/isDirectory methods", async () => {
			await fs.writeFile("/file.txt", "content");
			const stat = await adapter.stat("/file.txt");

			expect(typeof stat.isFile).toBe("function");
			expect(typeof stat.isDirectory).toBe("function");
			expect(stat.isFile()).toBe(true);
			expect(stat.isDirectory()).toBe(false);
		});

		it("should return size and mtime", async () => {
			await fs.writeFile("/file.txt", "hello");
			const stat = await adapter.stat("/file.txt");

			expect(stat.size).toBe(5);
			expect(stat.mtime).toBeInstanceOf(Date);
		});

		it("should throw for non-existent file", async () => {
			await expect(adapter.stat("/nonexistent")).rejects.toThrow();
		});
	});

	describe("lstat", () => {
		it("should return stat for file", async () => {
			await fs.writeFile("/file.txt", "content");
			const stat = await adapter.lstat("/file.txt");

			expect(stat.isFile()).toBe(true);
			expect(stat.isDirectory()).toBe(false);
		});
	});

	describe("readdir", () => {
		it("should return array of entry names", async () => {
			await fs.writeFile("/dir/file1.txt", "1");
			await fs.writeFile("/dir/file2.txt", "2");

			const entries = await adapter.readdir("/dir");
			expect(entries).toContain("file1.txt");
			expect(entries).toContain("file2.txt");
		});
	});

	describe("mkdir", () => {
		it("should not throw when mkdir is called", async () => {
			await expect(adapter.mkdir("/newdir")).resolves.not.toThrow();
		});
	});

	describe("rm", () => {
		it("should remove a file", async () => {
			await fs.writeFile("/todelete.txt", "delete me");
			await adapter.rm("/todelete.txt");

			await expect(fs.readFile("/todelete.txt")).rejects.toThrow();
		});
	});

	describe("exists", () => {
		it("should return true for existing file", async () => {
			await fs.writeFile("/exists.txt", "content");
			const result = await adapter.exists("/exists.txt");
			expect(result).toBe(true);
		});

		it("should return false for non-existent file", async () => {
			const result = await adapter.exists("/nonexistent.txt");
			expect(result).toBe(false);
		});
	});

	describe("resolvePath", () => {
		it("should resolve absolute paths", () => {
			const result = adapter.resolvePath("/base", "/absolute");
			expect(result).toBe("/absolute");
		});

		it("should resolve relative paths", () => {
			const result = adapter.resolvePath("/base", "relative");
			expect(result).toBe("/base/relative");
		});
	});
});

describe("isPromiseFs", () => {
	it("should return false for InMemoryFs (has 2 args)", () => {
		const fs = new InMemoryFs();
		expect(isPromiseFs(fs)).toBe(false);
	});

	it("should return false for objects without readFile", () => {
		expect(isPromiseFs({})).toBe(false);
	});

	it("should return true for objects with readFile function having < 2 args", () => {
		expect(isPromiseFs({ readFile: () => "sync" })).toBe(true);
	});
});
