# iso-git-shell

Isomorphic-Git adapter for `@cloudflare/shell`'s InMemoryFs filesystem.

This package provides a `ShellFsAdapter` class that wraps `@cloudflare/shell`'s `InMemoryFs` to match iso-git's expected filesystem interface, enabling git operations (clone, commit, push, branch, log, status) in Cloudflare Workers.

## Why?

Cloudflare Workers have a unique constraint: no filesystem access. However, isomorphic-git needs a filesystem to perform git operations. `@cloudflare/shell` provides an in-memory filesystem (`InMemoryFs`), but its interface doesn't match what iso-git expects.

This adapter bridges that gap by:

- Converting `stat.type` (`"file" | "directory"`) to iso-git's expected `stat.isFile()` / `stat.isDirectory()` methods
- Providing full `GitStat` interface with all required properties (`mtimeSeconds`, `mtimeNanoseconds`, `ctime`, etc.)
- Handling binary file operations correctly via `readFileBytes` / `writeFileBytes`
- Proper ENOENT error handling that iso-git expects
- The `promises` getter iso-git uses to detect Promise-based filesystems

## Installation

```bash
pnpm add iso-git-shell
```

## Usage

```typescript
import { InMemoryFs } from "@cloudflare/shell";
import { createGitFs } from "iso-git-shell";
import git from "isomorphic-git";

// Create the in-memory filesystem
const shellFs = new InMemoryFs();

// Create the git-compatible adapter
const fs = createGitFs(shellFs);

// Now you can use iso-git with the in-memory filesystem
await git.init({ fs, dir: "my-repo" });
await git.clone({ fs, url: "https://github.com/user/repo.git", dir: "my-repo" });
await git.add({ fs, dir: "my-repo", filepath: "file.txt" });
await git.commit({ fs, dir: "my-repo", message: "Initial commit" });
await git.push({ fs });
```

## API

### `createGitFs(fs: FileSystem): ShellFsAdapter`

Creates a `ShellFsAdapter` from a `@cloudflare/shell` `FileSystem` instance.

### `createMemoryGitFs(): ShellFsAdapter`

Creates a `ShellFsAdapter` with a new `InMemoryFs` instance.

### `ShellFsAdapter`

The adapter class with these key methods:

| Method | Description |
|--------|-------------|
| `readFile(path, options?)` | Read file as string (with encoding) or binary |
| `readFileBytes(path)` | Read file as Uint8Array |
| `writeFile(path, content)` | Write string content |
| `writeFileBytes(path, content)` | Write binary content |
| `stat(path)` | Get stat with full iso-git interface |
| `lstat(path)` | Get lstat (same as stat for InMemoryFs) |
| `exists(path)` | Check if file exists |
| `mkdir(path, options?)` | Create directory |
| `rm(path, options?)` | Remove file (silent no-op if not exists) |
| `rmdir(path, options?)` | Remove directory |
| `readdir(path)` | List directory entries |
| `readlink(path)` | Read symlink target |
| `symlink(target, path)` | Create symlink |
| `cp(src, dest, options?)` | Copy file/directory |
| `mv(src, dest)` | Move file/directory |
| `promises` | Returns `this` for iso-git compatibility |

## HTTP Client

For git operations that require network access (clone, push), you'll need an HTTP client:

```typescript
import git from "isomorphic-git";

function createHttpClient(token: string) {
    return {
        async request({ url, method, headers, body, signal }: any) {
            const response = await fetch(url, {
                method,
                headers: {
                    ...headers,
                    Authorization: `Basic ${btoa("x-access-token:" + token)}`,
                    "User-Agent": "git/isomorphic-git",
                },
                body: Array.isArray(body) 
                    ? concatenateArrayBuffers(body) 
                    : body,
                signal,
            });

            return {
                url: response.url,
                statusCode: response.status,
                statusMessage: response.statusText,
                headers: Object.fromEntries(response.headers.entries()),
                body: response.body,
            };
        },
    };
}

function concatenateArrayBuffers(chunks: Uint8Array[]): Uint8Array {
    const total = chunks.reduce((acc, c) => acc + c.length, 0);
    const result = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
        result.set(chunk, offset);
        offset += chunk.length;
    }
    return result;
}

// Usage
await git.clone({
    fs,
    http: createHttpClient(ghToken),
    url: "https://github.com/user/repo.git",
    dir: "my-repo",
});
```

## Testing

```bash
pnpm install
pnpm build
pnpm test
```

## Key Learnings

1. **HTTP Response Shape**: iso-git expects `statusCode`/`statusMessage`, not `status`/`statusText`

2. **Bearer vs Basic Auth**: Git uses Basic auth with `x-access-token` as username, not Bearer tokens

3. **User-Agent Required**: GitHub's `git-receive-pack` endpoint requires `User-Agent: git/isomorphic-git`

4. **Body Array Conversion**: iso-git passes packfile body as `Array<Uint8Array>`, but Cloudflare Workers' `fetch` needs a single `Uint8Array`

5. **ENOENT Handling**: `rm()` and `stat()` must throw errors with `code: 'ENOENT'` for iso-git to handle them correctly

6. **Binary Files**: Use `readFileBytes`/`writeFileBytes` for binary data - string-based operations corrupt binary files

7. **Full Stat Interface**: iso-git expects `mtimeSeconds`, `mtimeNanoseconds`, `ctime`, `mode`, `inode`, etc. - not just `mtime`

## License

MIT
