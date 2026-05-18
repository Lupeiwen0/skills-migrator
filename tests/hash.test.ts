import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { hashSkillDir, skillsHaveSameContent } from "../src/hash.js";

describe("hash", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), "hash-"));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  async function symlinkDir(target: string, linkPath: string): Promise<void> {
    if (os.platform() === "win32") {
      await symlink(path.resolve(target), linkPath, "junction");
      return;
    }

    await symlink(target, linkPath);
  }

  it("produces the same hash for the same content regardless of creation order", async () => {
    const first = path.join(tmpDir, "first");
    const second = path.join(tmpDir, "second");
    await mkdir(path.join(first, "nested"), { recursive: true });
    await writeFile(path.join(first, "b.txt"), "b\n");
    await writeFile(path.join(first, "nested", "a.txt"), "a\n");
    await mkdir(path.join(second, "nested"), { recursive: true });
    await writeFile(path.join(second, "nested", "a.txt"), "a\n");
    await writeFile(path.join(second, "b.txt"), "b\n");

    const firstHash = await hashSkillDir(first);
    const secondHash = await hashSkillDir(second);

    expect(firstHash).toEqual({ hash: secondHash.hash, safe: true, warnings: [] });
    expect(secondHash.safe).toBe(true);
    await expect(skillsHaveSameContent(first, second)).resolves.toBe(true);
  });

  it("ignores generated and local metadata noise", async () => {
    const clean = path.join(tmpDir, "clean");
    const noisy = path.join(tmpDir, "noisy");
    await mkdir(clean);
    await mkdir(noisy);
    await writeFile(path.join(clean, "SKILL.md"), "# Skill\n");
    await writeFile(path.join(noisy, "SKILL.md"), "# Skill\n");
    await writeFile(path.join(noisy, ".DS_Store"), "local metadata\n");
    await mkdir(path.join(noisy, ".git"));
    await writeFile(path.join(noisy, ".git", "HEAD"), "ref: refs/heads/main\n");
    await mkdir(path.join(noisy, "__pycache__"));
    await writeFile(path.join(noisy, "__pycache__", "module.pyc"), "compiled bytecode\n");
    await mkdir(path.join(noisy, ".tmp"));
    await writeFile(path.join(noisy, ".tmp", "scratch.txt"), "temporary work\n");
    await writeFile(path.join(noisy, "foo.backup-20260518120000"), "generated backup\n");

    await expect(skillsHaveSameContent(clean, noisy)).resolves.toBe(true);
  });

  it("detects different content", async () => {
    const first = path.join(tmpDir, "first");
    const second = path.join(tmpDir, "second");
    await mkdir(first);
    await mkdir(second);
    await writeFile(path.join(first, "SKILL.md"), "# One\n");
    await writeFile(path.join(second, "SKILL.md"), "# Two\n");

    await expect(skillsHaveSameContent(first, second)).resolves.toBe(false);
  });

  it("marks broken or external symlinks unsafe and keeps hashing", async () => {
    const skill = path.join(tmpDir, "skill");
    const outside = path.join(tmpDir, "outside.txt");
    await mkdir(skill);
    await writeFile(path.join(skill, "SKILL.md"), "# Skill\n");
    await writeFile(outside, "outside\n");
    await symlink(outside, path.join(skill, "external.txt"));
    await symlink("missing.txt", path.join(skill, "broken.txt"));

    const result = await hashSkillDir(skill);

    expect(result.safe).toBe(false);
    expect(result.hash).toMatch(/^[a-f0-9]{64}$/);
    expect(result.warnings).toHaveLength(2);
    expect(result.warnings.some((warning) => warning.includes("external.txt"))).toBe(true);
    expect(result.warnings.some((warning) => warning.includes("broken.txt"))).toBe(true);
    await expect(skillsHaveSameContent(skill, skill)).resolves.toBe(false);
  });

  it("marks symlink loops unsafe and keeps hashing", async () => {
    const skill = path.join(tmpDir, "skill");
    await mkdir(skill);
    await writeFile(path.join(skill, "SKILL.md"), "# Skill\n");
    await symlink("loop-b", path.join(skill, "loop-a"));
    await symlink("loop-a", path.join(skill, "loop-b"));

    const result = await hashSkillDir(skill);

    expect(result.safe).toBe(false);
    expect(result.hash).toMatch(/^[a-f0-9]{64}$/);
    expect(result.warnings).toHaveLength(2);
    expect(result.warnings.every((warning) => warning.includes("is an unresolvable symlink"))).toBe(true);
  });

  it("treats matching internal relative file symlinks as safe content", async () => {
    const first = path.join(tmpDir, "first");
    const second = path.join(tmpDir, "second");
    for (const skill of [first, second]) {
      await mkdir(path.join(skill, "nested"), { recursive: true });
      await writeFile(path.join(skill, "nested", "file.txt"), "same target\n");
      await symlink("nested/file.txt", path.join(skill, "link.txt"));
    }

    const firstHash = await hashSkillDir(first);
    const secondHash = await hashSkillDir(second);

    expect(firstHash).toEqual({ hash: secondHash.hash, safe: true, warnings: [] });
    await expect(skillsHaveSameContent(first, second)).resolves.toBe(true);
  });

  it("marks symlinks to internal directories unsafe", async () => {
    const skill = path.join(tmpDir, "skill");
    await mkdir(path.join(skill, "nested"), { recursive: true });
    await writeFile(path.join(skill, "nested", "file.txt"), "target\n");
    await symlinkDir(path.join(skill, "nested"), path.join(skill, "linked-dir"));

    const result = await hashSkillDir(skill);

    expect(result.safe).toBe(false);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain("linked-dir");
  });

  it("includes legitimate filenames containing .backup- in the hash", async () => {
    const first = path.join(tmpDir, "first");
    const second = path.join(tmpDir, "second");
    await mkdir(first);
    await mkdir(second);
    await writeFile(path.join(first, "SKILL.md"), "# Skill\n");
    await writeFile(path.join(second, "SKILL.md"), "# Skill\n");
    await writeFile(path.join(second, "notes.backup-draft.md"), "draft notes\n");

    await expect(skillsHaveSameContent(first, second)).resolves.toBe(false);
  });
});
