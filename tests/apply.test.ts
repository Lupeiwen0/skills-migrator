import { lstat, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeBackupPath, makeTempPath } from "../src/fs-safe.js";
import type { LinkStrategy, MigrationPlan, PlanAction, ScannedSkill } from "../src/types.js";

describe("applyMigrationPlan", () => {
  let tmpDir: string;

  beforeEach(async () => {
    vi.resetModules();
    vi.doUnmock("../src/symlink.js");
    tmpDir = await mkdtemp(path.join(os.tmpdir(), "apply-"));
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    vi.doUnmock("../src/symlink.js");
    await rm(tmpDir, { recursive: true, force: true });
  });

  async function apply(plan: MigrationPlan, stamp = "20260518120000", linkStrategy?: LinkStrategy) {
    const { applyMigrationPlan } = await import("../src/apply.js");
    return applyMigrationPlan(plan, { stamp, linkStrategy });
  }

  async function makeSkill(relativePath: string, content: string): Promise<string> {
    const skillDir = path.join(tmpDir, relativePath);
    await mkdir(skillDir, { recursive: true });
    await writeFile(path.join(skillDir, "SKILL.md"), content);
    return skillDir;
  }

  async function pathExists(filePath: string): Promise<boolean> {
    try {
      await lstat(filePath);
      return true;
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT") {
        return false;
      }

      throw error;
    }
  }

  function scannedSkill(name: string, sourcePath: string): ScannedSkill {
    return {
      name,
      agentId: "claude-code",
      sourcePath,
      isCanonical: false,
      isSymlink: false,
    };
  }

  function action(kind: PlanAction["kind"], skillName: string, sourcePath: string, canonicalPath: string): PlanAction {
    return { kind, skillName, source: scannedSkill(skillName, sourcePath), canonicalPath };
  }

  function plan(actions: PlanAction[], canonicalDir = path.join(tmpDir, ".agents", "skills")): MigrationPlan {
    return { canonicalDir, actions, warnings: [] };
  }

  function recoveryBackupPath(skillName = "foo", stamp = "20260518120000"): string {
    return path.join(tmpDir, ".agents", ".tmp", "backups", stamp, "claude-code", skillName);
  }

  it("migrate copies source to canonical, links source, and records backup", async () => {
    const source = await makeSkill(".claude/skills/foo", "# Foo\n");
    const canonical = path.join(tmpDir, ".agents", "skills", "foo");
    const migration = action("migrate", "foo", source, canonical);

    const result = await apply(plan([migration]));

    await expect(readFile(path.join(canonical, "SKILL.md"), "utf8")).resolves.toBe("# Foo\n");
    expect((await lstat(source)).isSymbolicLink()).toBe(true);
    await expect(realpath(source)).resolves.toBe(await realpath(canonical));
    expect(result.migrated).toEqual([migration]);
    expect(result.backups).toEqual([recoveryBackupPath()]);
    await expect(readFile(path.join(recoveryBackupPath(), "SKILL.md"), "utf8")).resolves.toBe("# Foo\n");
    await expect(pathExists(makeBackupPath(source, "20260518120000"))).resolves.toBe(false);
  });

  it("link-identical links source without copying canonical", async () => {
    const source = await makeSkill(".claude/skills/foo", "# Source\n");
    const canonical = await makeSkill(".agents/skills/foo", "# Canonical\n");
    const link = action("link-identical", "foo", source, canonical);

    const result = await apply(plan([link]));

    await expect(readFile(path.join(canonical, "SKILL.md"), "utf8")).resolves.toBe("# Canonical\n");
    expect((await lstat(source)).isSymbolicLink()).toBe(true);
    await expect(realpath(source)).resolves.toBe(await realpath(canonical));
    expect(result.linked).toEqual([link]);
  });

  it("copy strategy replaces source with a copy instead of a symlink", async () => {
    const source = await makeSkill(".claude/skills/foo", "# Source\n");
    const canonical = await makeSkill(".agents/skills/foo", "# Canonical\n");
    const link = action("link-identical", "foo", source, canonical);

    const result = await apply(plan([link]), "20260518120000", "copy");

    expect((await lstat(source)).isDirectory()).toBe(true);
    await expect(readFile(path.join(source, "SKILL.md"), "utf8")).resolves.toBe("# Canonical\n");
    expect(result.linked).toEqual([link]);
  });

  it("default strategy falls back to copy when symlink creation fails", async () => {
    const source = await makeSkill(".claude/skills/foo", "# Source\n");
    const canonical = await makeSkill(".agents/skills/foo", "# Canonical\n");
    const link = action("link-identical", "foo", source, canonical);
    vi.doMock("../src/symlink.js", () => ({
      createRelativeSymlink: vi.fn(async () => {
        throw new Error("symlink failed");
      }),
    }));

    const result = await apply(plan([link]));

    expect(result.failed).toEqual([]);
    expect((await lstat(source)).isDirectory()).toBe(true);
    await expect(readFile(path.join(source, "SKILL.md"), "utf8")).resolves.toBe("# Canonical\n");
    expect(result.backups).toEqual([recoveryBackupPath()]);
    expect(result.connectionWarnings).toEqual(["Symlink failed for foo; copied instead. Reason: symlink failed"]);
  });

  it("skipped action does not modify source", async () => {
    const source = await makeSkill(".claude/skills/foo", "# Foo\n");
    const canonical = path.join(tmpDir, ".agents", "skills", "foo");
    const skipped = action("skip", "foo", source, canonical);

    const result = await apply(plan([skipped]));

    expect((await lstat(source)).isDirectory()).toBe(true);
    await expect(readFile(path.join(source, "SKILL.md"), "utf8")).resolves.toBe("# Foo\n");
    expect(result.skipped).toEqual([skipped]);
    expect(result.backups).toEqual([]);
  });

  it("already action does not modify source", async () => {
    const source = await makeSkill(".agents/skills/foo", "# Foo\n");
    const already = action("already-canonical", "foo", source, source);

    const result = await apply(plan([already]));

    expect((await lstat(source)).isDirectory()).toBe(true);
    await expect(readFile(path.join(source, "SKILL.md"), "utf8")).resolves.toBe("# Foo\n");
    expect(result.already).toEqual([already]);
    expect(result.backups).toEqual([]);
  });

  it("symlink creation failure restores source backup and records failed action", async () => {
    const source = await makeSkill(".claude/skills/foo", "# Foo\n");
    const canonical = await makeSkill(".agents/skills/foo", "# Foo\n");
    const link = action("link-identical", "foo", source, canonical);
    vi.doMock("../src/symlink.js", () => ({
      createRelativeSymlink: vi.fn(async () => {
        throw new Error("symlink failed");
      }),
    }));

    const result = await apply(plan([link]), "20260518120000", "symlink");

    expect(result.failed).toHaveLength(1);
    expect(result.failed[0].action).toBe(link);
    expect(result.failed[0].error.message).toBe("symlink failed");
    expect((await lstat(source)).isDirectory()).toBe(true);
    await expect(readFile(path.join(source, "SKILL.md"), "utf8")).resolves.toBe("# Foo\n");
    await expect(pathExists(makeBackupPath(source, "20260518120000"))).resolves.toBe(false);
    expect(result.backups).toEqual([]);
  });

  it("symlink creation failure during migrate removes canonical content and restores source", async () => {
    const source = await makeSkill(".claude/skills/foo", "# Foo\n");
    const canonical = path.join(tmpDir, ".agents", "skills", "foo");
    const migration = action("migrate", "foo", source, canonical);
    vi.doMock("../src/symlink.js", () => ({
      createRelativeSymlink: vi.fn(async () => {
        throw new Error("symlink failed");
      }),
    }));

    const result = await apply(plan([migration]), "20260518120000", "symlink");

    expect(result.failed).toHaveLength(1);
    expect(result.failed[0].action).toBe(migration);
    expect(result.failed[0].error.message).toBe("symlink failed");
    expect((await lstat(source)).isDirectory()).toBe(true);
    await expect(readFile(path.join(source, "SKILL.md"), "utf8")).resolves.toBe("# Foo\n");
    await expect(pathExists(canonical)).resolves.toBe(false);
    expect(result.backups).toEqual([]);
  });

  it("migrate temp missing SKILL.md records failure and does not create source symlink", async () => {
    const source = path.join(tmpDir, ".claude", "skills", "foo");
    const canonical = path.join(tmpDir, ".agents", "skills", "foo");
    await mkdir(source, { recursive: true });
    await writeFile(path.join(source, "README.md"), "# Not a skill\n");
    const migration = action("migrate", "foo", source, canonical);

    const result = await apply(plan([migration]));

    expect(result.failed).toHaveLength(1);
    expect(result.failed[0].action).toBe(migration);
    expect(result.failed[0].error.message).toContain("missing SKILL.md");
    expect((await lstat(source)).isDirectory()).toBe(true);
    await expect(pathExists(canonical)).resolves.toBe(false);
    await expect(pathExists(makeTempPath(path.dirname(canonical), "foo", "20260518120000"))).resolves.toBe(false);
  });
});
