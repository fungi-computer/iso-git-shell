/**
 * Integration tests for iso-git with @cloudflare/shell adapter
 *
 * These tests verify that iso-git can work with our ShellFsAdapter.
 * They focus on local operations first (init, add, commit) before tackling network.
 */

import { describe, it, expect, beforeEach } from "vitest";
import git from "isomorphic-git";
import { InMemoryFs } from "@cloudflare/shell";
import { ShellFsAdapter, createGitFs } from "./fs-adapter.js";

describe("iso-git with ShellFsAdapter", () => {
	let adapter: ShellFsAdapter;

	beforeEach(() => {
		adapter = createGitFs(new InMemoryFs());
	});

	describe("git.init", () => {
		it("should initialize a new git repository", async () => {
			// dir should be the working directory, not .git
			const dir = "/test-repo";

			await git.init({
				fs: adapter,
				dir,
			});

			// Verify .git directory was created
			const headExists = await adapter.exists(`${dir}/.git/HEAD`);
			expect(headExists).toBe(true);
		});
	});

	describe("git.add", () => {
		it("should stage a file", async () => {
			const dir = "/test-repo";

			await git.init({ fs: adapter, dir });

			// Create a file
			await adapter.writeFile(`${dir}/test.txt`, "hello world");

			// Add to staging
			await git.add({
				fs: adapter,
				dir,
				filepath: "test.txt",
			});

			// Verify it's staged (in the index)
			const indexExists = await adapter.exists(`${dir}/.git/index`);
			expect(indexExists).toBe(true);
		});
	});

	describe("git.commit", () => {
		it("should create a commit", async () => {
			const dir = "/test-repo";

			await git.init({ fs: adapter, dir });

			// Create and stage a file
			await adapter.writeFile(`${dir}/test.txt`, "hello world");
			await git.add({ fs: adapter, dir, filepath: "test.txt" });

			// Commit
			const sha = await git.commit({
				fs: adapter,
				dir,
				message: "Initial commit",
				author: { name: "Test", email: "test@test.com" },
			});

			expect(sha).toBeDefined();
			expect(sha.length).toBe(40); // Git SHA-1 hash is 40 chars
		});
	});

	describe("git.status", () => {
		it("should show clean status for committed file", async () => {
			const dir = "/test-repo";

			await git.init({ fs: adapter, dir });
			await adapter.writeFile(`${dir}/test.txt`, "hello world");
			await git.add({ fs: adapter, dir, filepath: "test.txt" });
			await git.commit({
				fs: adapter,
				dir,
				message: "Initial commit",
				author: { name: "Test", email: "test@test.com" },
			});

			const status = await git.status({
				fs: adapter,
				dir,
				filepath: "test.txt",
			});

			expect(status).toBe("unmodified");
		});

		it("should show modified status for changed file", async () => {
			const dir = "/test-repo";

			await git.init({ fs: adapter, dir });
			await adapter.writeFile(`${dir}/test.txt`, "hello world");
			await git.add({ fs: adapter, dir, filepath: "test.txt" });
			await git.commit({
				fs: adapter,
				dir,
				message: "Initial commit",
				author: { name: "Test", email: "test@test.com" },
			});

			// Modify the file
			await adapter.writeFile(`${dir}/test.txt`, "modified");

			const status = await git.status({
				fs: adapter,
				dir,
				filepath: "test.txt",
			});

			expect(status).toBe("*modified");
		});
	});

	describe("git.log", () => {
		it("should return commit history", async () => {
			const dir = "/test-repo";

			await git.init({ fs: adapter, dir });
			await adapter.writeFile(`${dir}/test.txt`, "hello");
			await git.add({ fs: adapter, dir, filepath: "test.txt" });
			await git.commit({
				fs: adapter,
				dir,
				message: "First commit",
				author: { name: "Test", email: "test@test.com" },
			});

			const log = await git.log({ fs: adapter, dir });

			expect(log).toHaveLength(1);
			expect(log[0].commit.message.trim()).toBe("First commit");
		});
	});
});
