import { mkdir, mkdtemp, readFile, readlink, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { copyDir, makeBackupPath, makeTempPath, pathExists, safeLstat } from "../src/fs-safe.js";

describe("fs-safe", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), "fs-safe-"));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("returns true for an existing file and false for a missing path", async () => {
    const existingFile = path.join(tmpDir, "SKILL.md");
    const missingFile = path.join(tmpDir, "missing.md");
    await writeFile(existingFile, "# Test Skill\n");

    await expect(pathExists(existingFile)).resolves.toBe(true);
    await expect(pathExists(missingFile)).resolves.toBe(false);
  });

  it("rethrows non-ENOENT errors from pathExists", async () => {
    await expect(pathExists("bad\0path")).rejects.toThrow();
  });

  it("returns undefined from safeLstat for missing paths", async () => {
    await expect(safeLstat(path.join(tmpDir, "missing"))).resolves.toBeUndefined();
  });

  it("rethrows non-ENOENT errors from safeLstat", async () => {
    await expect(safeLstat("bad\0path")).rejects.toThrow();
  });

  it("makes a temp path next to the skills directory", () => {
    const canonicalDir = path.join(path.sep, "repo", ".agents", "skills");

    expect(makeTempPath(canonicalDir, "foo", "123")).toBe(path.join(path.sep, "repo", ".agents", ".tmp", "foo-123"));
  });

  it("appends backup stamp to source paths", () => {
    expect(makeBackupPath(path.join(tmpDir, "foo"), "123")).toBe(`${path.join(tmpDir, "foo")}.backup-123`);
  });

  it("recursively copies SKILL.md and nested files", async () => {
    const source = path.join(tmpDir, "source");
    const dest = path.join(tmpDir, "dest");
    await mkdir(path.join(source, "nested"), { recursive: true });
    await writeFile(path.join(source, "SKILL.md"), "# Test Skill\n");
    await writeFile(path.join(source, "nested", "file.txt"), "nested contents\n");

    await copyDir(source, dest);

    await expect(readFile(path.join(dest, "SKILL.md"), "utf8")).resolves.toBe("# Test Skill\n");
    await expect(readFile(path.join(dest, "nested", "file.txt"), "utf8")).resolves.toBe("nested contents\n");
  });

  it("rejects when destination already exists", async () => {
    const source = path.join(tmpDir, "source");
    const dest = path.join(tmpDir, "dest");
    await mkdir(source);
    await mkdir(dest);
    await writeFile(path.join(source, "SKILL.md"), "# Test Skill\n");

    await expect(copyDir(source, dest)).rejects.toThrow();
  });

  it("preserves relative internal symlink text when copying", async () => {
    const source = path.join(tmpDir, "source");
    const dest = path.join(tmpDir, "dest");
    await mkdir(path.join(source, "nested"), { recursive: true });
    await writeFile(path.join(source, "nested", "file.txt"), "nested contents\n");
    await symlink("nested/file.txt", path.join(source, "link.txt"));

    await copyDir(source, dest);

    expect(await readlink(path.join(dest, "link.txt"))).toBe("nested/file.txt");
  });
});
