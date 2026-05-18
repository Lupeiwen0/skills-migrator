import { lstat, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentId, LinkStrategy } from "../src/types.js";

describe("cli", () => {
  let tmpDir: string;
  const originalCwd = process.cwd();
  const originalExitCode = process.exitCode;

  beforeEach(async () => {
    vi.resetModules();
    tmpDir = await mkdtemp(path.join(os.tmpdir(), "asm-cli-"));
    process.chdir(tmpDir);
    process.exitCode = undefined;
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    vi.doUnmock("../src/prompts.js");
    process.chdir(originalCwd);
    process.exitCode = originalExitCode;
    await rm(tmpDir, { recursive: true, force: true });
  });

  async function makeSkill() {
    const skillDir = path.join(tmpDir, ".claude", "skills", "foo");
    await mkdir(skillDir, { recursive: true });
    await writeFile(path.join(skillDir, "SKILL.md"), "foo");
  }

  async function makeCanonicalSkill() {
    const skillDir = path.join(tmpDir, ".agents", "skills", "foo");
    await mkdir(skillDir, { recursive: true });
    await writeFile(path.join(skillDir, "SKILL.md"), "foo");
  }

  async function makeSkillAt(relativePath: string, content: string) {
    const skillDir = path.join(tmpDir, relativePath);
    await mkdir(skillDir, { recursive: true });
    await writeFile(path.join(skillDir, "SKILL.md"), content);
  }

  async function runCli(
    args: string[],
    prompts: {
      selectedAgents?: AgentId[];
      linkStrategy?: LinkStrategy | undefined;
      confirm?: boolean;
    } = {},
  ) {
    const logs: string[] = [];
    const originalLog = console.log;
    const selectTargetAgents = vi.fn(async () => prompts.selectedAgents ?? ["claude-code"]);
    const selectLinkStrategy = vi.fn(async () => prompts.linkStrategy ?? "symlink-copy-fallback");
    const confirmApplyPlan = vi.fn(async () => prompts.confirm ?? true);
    vi.doMock("../src/prompts.js", () => ({
      selectTargetAgents,
      selectLinkStrategy,
      confirmApplyPlan,
    }));
    const { main } = await import("../src/cli.js");
    console.log = (value?: unknown) => {
      logs.push(String(value ?? ""));
    };
    try {
      await main(args);
    } finally {
      console.log = originalLog;
    }
    return { stdout: logs.join("\n"), selectTargetAgents, selectLinkStrategy, confirmApplyPlan };
  }

  it("prompts for target agents when --agent is omitted", async () => {
    await makeSkill();

    const { stdout, selectTargetAgents } = await runCli(["migrate", "--dry-run"]);

    expect(selectTargetAgents).toHaveBeenCalledWith(false, ["claude-code"]);
    expect(stdout).toContain("Migration plan");
    expect(stdout).toContain("foo: migrate");
    await expect(readFile(path.join(tmpDir, ".agents", "skills", "foo", "SKILL.md"), "utf8")).rejects.toThrow();
  });

  it("migrates discovered project agent skills before extension target selection", async () => {
    await makeSkillAt(path.join(".claude", "skills", "claude-only"), "claude");
    await makeSkillAt(path.join(".cursor", "skills", "cursor-only"), "cursor");
    await makeSkillAt(path.join(".kiro", "skills", "kiro-only"), "kiro");
    await makeSkillAt(path.join(".windsurf", "skills", "windsurf-only"), "windsurf");
    await makeSkillAt(path.join(".trae", "skills", "trae-only"), "trae");
    await makeSkillAt(path.join(".qoder", "skills", "qoder-only"), "qoder");
    await mkdir(path.join(tmpDir, ".gemini", "antigravity"), { recursive: true });

    const { stdout, selectTargetAgents } = await runCli(["migrate", "--dry-run"], {
      selectedAgents: ["claude-code"],
    });

    expect(selectTargetAgents).toHaveBeenCalledWith(false, [
      "claude-code",
      "cursor",
      "kiro",
      "windsurf",
      "trae",
      "qoder",
      "antigravity",
    ]);
    expect(stdout).toContain("claude-only: migrate");
    expect(stdout).toContain("cursor-only: migrate");
    expect(stdout).toContain("kiro-only: migrate");
    expect(stdout).toContain("windsurf-only: migrate");
    expect(stdout).toContain("trae-only: migrate");
    expect(stdout).toContain("qoder-only: migrate");
  });

  it("does not prompt for target agents when --agent is provided", async () => {
    await makeSkill();

    const { selectTargetAgents } = await runCli(["migrate", "--agent", "claude-code", "--dry-run"]);

    expect(selectTargetAgents).not.toHaveBeenCalled();
  });

  it("prompts for connection method before applying", async () => {
    await makeSkill();

    const { stdout, selectLinkStrategy } = await runCli(["migrate"], { linkStrategy: "copy" });

    expect(selectLinkStrategy).toHaveBeenCalledWith(false);
    expect(stdout).toContain("Migrated: 1");
    expect(await readFile(path.join(tmpDir, ".claude", "skills", "foo", "SKILL.md"), "utf8")).toBe("foo");
  });

  it("applies migration with --yes", async () => {
    await makeSkill();

    const { stdout, selectTargetAgents, selectLinkStrategy } = await runCli(["migrate", "--yes"]);

    expect(selectTargetAgents).toHaveBeenCalledWith(true, ["claude-code"]);
    expect(selectLinkStrategy).toHaveBeenCalledWith(true);
    expect(stdout).toContain("Migrated: 1");
    expect(await readFile(path.join(tmpDir, ".agents", "skills", "foo", "SKILL.md"), "utf8")).toBe("foo");
  });

  it("links canonical .agents skills into an explicitly selected Claude target", async () => {
    await makeCanonicalSkill();

    const { stdout } = await runCli(["migrate", "--agent", "claude-code", "--yes"]);
    const claudeSkill = path.join(tmpDir, ".claude", "skills", "foo");
    const canonicalSkill = path.join(tmpDir, ".agents", "skills", "foo");

    expect(stdout).toContain("Linked: 1");
    expect((await lstat(claudeSkill)).isSymbolicLink()).toBe(true);
    await expect(realpath(claudeSkill)).resolves.toBe(await realpath(canonicalSkill));
  });
});
