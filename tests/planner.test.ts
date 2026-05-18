import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createMigrationPlan } from "../src/planner.js";
import type { ScanResult, ScanWarning, ScannedSkill } from "../src/types.js";

describe("createMigrationPlan", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), "planner-"));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  async function skill(relativePath: string, content: string): Promise<string> {
    const skillDir = path.join(tmpDir, relativePath);
    await mkdir(skillDir, { recursive: true });
    await writeFile(path.join(skillDir, "SKILL.md"), content);
    return skillDir;
  }

  function scanned(
    name: string,
    agentId: ScannedSkill["agentId"],
    sourcePath: string,
    isCanonical: boolean,
    options: Partial<Pick<ScannedSkill, "isSymlink" | "realPath">> = {},
  ): ScannedSkill {
    return {
      name,
      agentId,
      sourcePath,
      isCanonical,
      isSymlink: options.isSymlink ?? false,
      realPath: options.realPath,
    };
  }

  function scan(skills: ScannedSkill[], warnings: ScanWarning[] = []): ScanResult {
    return { skills, warnings };
  }

  async function symlinkDir(target: string, linkPath: string): Promise<void> {
    await mkdir(path.dirname(linkPath), { recursive: true });
    if (os.platform() === "win32") {
      await symlink(path.resolve(target), linkPath, "junction");
      return;
    }

    await symlink(target, linkPath);
  }

  it("plans canonical skills as already canonical", async () => {
    const canonicalDir = path.join(tmpDir, ".agents", "skills");
    const canonical = await skill(".agents/skills/foo", "# Foo\n");

    const plan = await createMigrationPlan(scan([scanned("foo", "codex", canonical, true)]), {
      canonicalDir,
      yes: false,
    });

    expect(plan.actions.map((action) => action.kind)).toEqual(["already-canonical"]);
    expect(plan.actions[0]).toMatchObject({
      skillName: "foo",
      canonicalPath: path.join(canonicalDir, "foo"),
    });
  });

  it("plans non-canonical skills for migration when canonical is missing", async () => {
    const canonicalDir = path.join(tmpDir, ".agents", "skills");
    const source = await skill(".claude/skills/foo", "# Foo\n");

    const plan = await createMigrationPlan(scan([scanned("foo", "claude-code", source, false)]), {
      canonicalDir,
      yes: false,
    });

    expect(plan.actions.map((action) => action.kind)).toEqual(["migrate"]);
    expect(plan.actions[0]).toMatchObject({
      skillName: "foo",
      source: { sourcePath: source },
      canonicalPath: path.join(canonicalDir, "foo"),
    });
  });

  it("plans existing canonical then links identical non-canonical content", async () => {
    const canonicalDir = path.join(tmpDir, ".agents", "skills");
    const canonical = await skill(".agents/skills/foo", "# Foo\n");
    const source = await skill(".claude/skills/foo", "# Foo\n");

    const plan = await createMigrationPlan(
      scan([scanned("foo", "claude-code", source, false), scanned("foo", "codex", canonical, true)]),
      { canonicalDir, yes: false },
    );

    expect(plan.actions.map((action) => action.kind)).toEqual(["already-canonical", "link-identical"]);
  });

  it("plans yes-mode conflicts as skips with a conflict reason", async () => {
    const canonicalDir = path.join(tmpDir, ".agents", "skills");
    const canonical = await skill(".agents/skills/foo", "# Foo\n");
    const source = await skill(".claude/skills/foo", "# Different\n");

    const plan = await createMigrationPlan(
      scan([scanned("foo", "codex", canonical, true), scanned("foo", "claude-code", source, false)]),
      { canonicalDir, yes: true },
    );

    expect(plan.actions.map((action) => action.kind)).toEqual(["already-canonical", "skip"]);
    expect(plan.actions[1].reason).toContain("conflict");
  });

  it("plans interactive conflicts as conflicts", async () => {
    const canonicalDir = path.join(tmpDir, ".agents", "skills");
    const canonical = await skill(".agents/skills/foo", "# Foo\n");
    const source = await skill(".claude/skills/foo", "# Different\n");

    const plan = await createMigrationPlan(
      scan([scanned("foo", "codex", canonical, true), scanned("foo", "claude-code", source, false)]),
      { canonicalDir, yes: false },
    );

    expect(plan.actions.map((action) => action.kind)).toEqual(["already-canonical", "conflict"]);
    expect(plan.actions[1].reason).toContain("conflict");
  });

  it("uses deterministic first non-canonical source as migration content for later same-name sources", async () => {
    const canonicalDir = path.join(tmpDir, ".agents", "skills");
    const laterAgent = await skill(".opencode/skills/foo", "# Foo\n");
    const firstAgent = await skill(".claude/skills/foo", "# Foo\n");
    const different = await skill(".cursor/skills/foo", "# Different\n");

    const identicalPlan = await createMigrationPlan(
      scan([
        scanned("foo", "opencode", laterAgent, false),
        scanned("foo", "claude-code", firstAgent, false),
      ]),
      { canonicalDir, yes: false },
    );

    expect(identicalPlan.actions.map((action) => [action.kind, action.source.agentId])).toEqual([
      ["migrate", "claude-code"],
      ["link-identical", "opencode"],
    ]);

    const conflictPlan = await createMigrationPlan(
      scan([
        scanned("foo", "opencode", laterAgent, false),
        scanned("foo", "claude-code", firstAgent, false),
        scanned("foo", "cursor", different, false),
      ]),
      { canonicalDir, yes: false },
    );

    expect(conflictPlan.actions.map((action) => [action.kind, action.source.agentId])).toEqual([
      ["migrate", "claude-code"],
      ["conflict", "cursor"],
      ["link-identical", "opencode"],
    ]);
  });

  it("does not compare non-canonical symlinks pointing elsewhere as content equal", async () => {
    const canonicalDir = path.join(tmpDir, ".agents", "skills");
    await skill(".agents/skills/foo", "# Foo\n");
    const target = await skill("external/foo", "# Foo\n");
    const linkPath = path.join(tmpDir, ".claude", "skills", "foo");
    await symlinkDir(target, linkPath);

    const yesPlan = await createMigrationPlan(
      scan([scanned("foo", "claude-code", linkPath, false, { isSymlink: true, realPath: await realpath(target) })]),
      { canonicalDir, yes: true },
    );
    const interactivePlan = await createMigrationPlan(
      scan([scanned("foo", "claude-code", linkPath, false, { isSymlink: true, realPath: await realpath(target) })]),
      { canonicalDir, yes: false },
    );

    expect(yesPlan.actions.map((action) => action.kind)).toEqual(["skip"]);
    expect(yesPlan.actions[0].reason).toContain("conflict");
    expect(interactivePlan.actions.map((action) => action.kind)).toEqual(["conflict"]);
    expect(interactivePlan.actions[0].reason).toContain("conflict");
  });

  it("plans invalid canonical regular files as conflict or yes-mode skip", async () => {
    const canonicalDir = path.join(tmpDir, ".agents", "skills");
    const canonicalPath = path.join(canonicalDir, "foo");
    await mkdir(canonicalDir, { recursive: true });
    await writeFile(canonicalPath, "# Not a directory\n");
    const source = await skill(".claude/skills/foo", "# Foo\n");

    const yesPlan = await createMigrationPlan(scan([scanned("foo", "claude-code", source, false)]), {
      canonicalDir,
      yes: true,
    });
    const interactivePlan = await createMigrationPlan(scan([scanned("foo", "claude-code", source, false)]), {
      canonicalDir,
      yes: false,
    });

    expect(yesPlan.actions.map((action) => action.kind)).toEqual(["skip"]);
    expect(yesPlan.actions[0].reason).toContain("invalid canonical");
    expect(yesPlan.actions[0].reason).toContain("conflict");
    expect(interactivePlan.actions.map((action) => action.kind)).toEqual(["conflict"]);
    expect(interactivePlan.actions[0].reason).toContain("invalid canonical");
    expect(interactivePlan.actions[0].reason).toContain("conflict");
  });

  it("plans invalid canonical broken symlinks as conflict or yes-mode skip", async () => {
    const canonicalDir = path.join(tmpDir, ".agents", "skills");
    const canonicalPath = path.join(canonicalDir, "foo");
    await mkdir(canonicalDir, { recursive: true });
    await symlink(path.join(tmpDir, "missing-canonical"), canonicalPath);
    const source = await skill(".claude/skills/foo", "# Foo\n");

    const yesPlan = await createMigrationPlan(scan([scanned("foo", "claude-code", source, false)]), {
      canonicalDir,
      yes: true,
    });
    const interactivePlan = await createMigrationPlan(scan([scanned("foo", "claude-code", source, false)]), {
      canonicalDir,
      yes: false,
    });

    expect(yesPlan.actions.map((action) => action.kind)).toEqual(["skip"]);
    expect(yesPlan.actions[0].reason).toContain("invalid canonical");
    expect(yesPlan.actions[0].reason).toContain("conflict");
    expect(interactivePlan.actions.map((action) => action.kind)).toEqual(["conflict"]);
    expect(interactivePlan.actions[0].reason).toContain("invalid canonical");
    expect(interactivePlan.actions[0].reason).toContain("conflict");
  });

  it("plans non-canonical symlinks already pointing at canonical as already linked", async () => {
    const canonicalDir = path.join(tmpDir, ".agents", "skills");
    const canonical = await skill(".agents/skills/foo", "# Foo\n");
    const linkPath = path.join(tmpDir, ".claude", "skills", "foo");
    await symlinkDir(canonical, linkPath);

    const plan = await createMigrationPlan(
      scan([scanned("foo", "claude-code", linkPath, false, { isSymlink: true, realPath: await realpath(canonical) })]),
      { canonicalDir, yes: false },
    );

    expect(plan.actions.map((action) => action.kind)).toEqual(["already-linked"]);
  });

  it("preserves scan warnings in the plan", async () => {
    const canonicalDir = path.join(tmpDir, ".agents", "skills");
    const warning: ScanWarning = {
      agentId: "codex",
      path: path.join(tmpDir, "broken"),
      message: "broken symlink",
    };

    const plan = await createMigrationPlan(scan([], [warning]), { canonicalDir, yes: false });

    expect(plan.warnings).toEqual([warning]);
  });
});
