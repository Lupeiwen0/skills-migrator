import path from "node:path";
import { describe, expect, it } from "vitest";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import { afterEach, beforeEach } from "vitest";
import { detectProjectAgents, getCanonicalDir, parseAgentId, resolveAgents, resolveProjectScanAgents } from "../src/agents.js";

describe("agents", () => {
  const cwd = path.join(path.sep, "repo");
  const homeDir = path.join(path.sep, "home", "user");
  const codexHome = path.join(path.sep, "codex-home");
  const claudeHome = path.join(path.sep, "claude-home");
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), "agents-"));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("uses .agents/skills as project canonical", () => {
    expect(getCanonicalDir({ cwd, homeDir, global: false })).toBe(path.join(cwd, ".agents", "skills"));
  });

  it("uses ~/.agents/skills as global canonical", () => {
    expect(getCanonicalDir({ cwd, homeDir, global: true })).toBe(path.join(homeDir, ".agents", "skills"));
  });

  it("resolves project agents", () => {
    const agents = resolveAgents({ cwd, homeDir, env: {}, global: false });
    expect(agents.map((agent) => [agent.id, agent.skillsDir, agent.isCanonical])).toEqual([
      ["codex", path.join(cwd, ".agents", "skills"), true],
      ["claude-code", path.join(cwd, ".claude", "skills"), false],
      ["opencode", path.join(cwd, ".agents", "skills"), true],
      ["cursor", path.join(cwd, ".agents", "skills"), true],
      ["kiro", path.join(cwd, ".kiro", "skills"), false],
      ["windsurf", path.join(cwd, ".windsurf", "skills"), false],
      ["trae", path.join(cwd, ".trae", "skills"), false],
      ["qoder", path.join(cwd, ".qoder", "skills"), false],
      ["antigravity", path.join(cwd, ".agents", "skills"), true],
    ]);
  });

  it("resolves global agents with fallback paths", () => {
    const agents = resolveAgents({ cwd, homeDir, env: {}, global: true });
    expect(agents.map((agent) => [agent.id, agent.skillsDir, agent.isCanonical])).toEqual([
      ["codex", path.join(homeDir, ".codex", "skills"), false],
      ["claude-code", path.join(homeDir, ".claude", "skills"), false],
      ["opencode", path.join(homeDir, ".config", "opencode", "skills"), false],
      ["cursor", path.join(homeDir, ".cursor", "skills"), false],
      ["kiro", path.join(homeDir, ".kiro", "skills"), false],
      ["windsurf", path.join(homeDir, ".codeium", "windsurf", "skills"), false],
      ["trae", path.join(homeDir, ".trae", "skills"), false],
      ["qoder", path.join(homeDir, ".qoder", "skills"), false],
      ["antigravity", path.join(homeDir, ".gemini", "antigravity", "skills"), false],
    ]);
  });

  it("resolves global agents with environment overrides", () => {
    const agents = resolveAgents({
      cwd,
      homeDir,
      env: { CODEX_HOME: codexHome, CLAUDE_CONFIG_DIR: claudeHome },
      global: true,
    });
    expect(agents.map((agent) => [agent.id, agent.skillsDir, agent.isCanonical])).toEqual([
      ["codex", path.join(codexHome, "skills"), false],
      ["claude-code", path.join(claudeHome, "skills"), false],
      ["opencode", path.join(homeDir, ".config", "opencode", "skills"), false],
      ["cursor", path.join(homeDir, ".cursor", "skills"), false],
      ["kiro", path.join(homeDir, ".kiro", "skills"), false],
      ["windsurf", path.join(homeDir, ".codeium", "windsurf", "skills"), false],
      ["trae", path.join(homeDir, ".trae", "skills"), false],
      ["qoder", path.join(homeDir, ".qoder", "skills"), false],
      ["antigravity", path.join(homeDir, ".gemini", "antigravity", "skills"), false],
    ]);
  });

  it("filters selected agents", () => {
    const agents = resolveAgents({
      cwd,
      homeDir,
      env: {},
      global: false,
      selectedAgents: ["claude-code"],
    });
    expect(agents.map((agent) => agent.id)).toEqual(["claude-code"]);
  });

  it("treats an empty selected agents list like all agents", () => {
    const agents = resolveAgents({
      cwd,
      homeDir,
      env: {},
      global: false,
      selectedAgents: [],
    });
    expect(agents.map((agent) => agent.id)).toEqual([
      "codex",
      "claude-code",
      "opencode",
      "cursor",
      "kiro",
      "windsurf",
      "trae",
      "qoder",
      "antigravity",
    ]);
  });

  it("parses supported agent ids", () => {
    expect(parseAgentId("codex")).toBe("codex");
    expect(parseAgentId("claude-code")).toBe("claude-code");
    expect(parseAgentId("opencode")).toBe("opencode");
    expect(parseAgentId("cursor")).toBe("cursor");
    expect(parseAgentId("kiro")).toBe("kiro");
    expect(parseAgentId("windsurf")).toBe("windsurf");
    expect(parseAgentId("trae")).toBe("trae");
    expect(parseAgentId("qoder")).toBe("qoder");
    expect(parseAgentId("antigravity")).toBe("antigravity");
    expect(() => parseAgentId("unknown")).toThrow("Unsupported agent");
  });

  it("resolves project scan locations, including agent-specific legacy skill dirs", () => {
    const agents = resolveProjectScanAgents({ cwd, homeDir, env: {}, global: false });

    expect(agents.map((agent) => [agent.id, agent.skillsDir, agent.isCanonical])).toEqual([
      ["codex", path.join(cwd, ".agents", "skills"), true],
      ["claude-code", path.join(cwd, ".claude", "skills"), false],
      ["opencode", path.join(cwd, ".agents", "skills"), true],
      ["opencode", path.join(cwd, ".opencode", "skills"), false],
      ["cursor", path.join(cwd, ".agents", "skills"), true],
      ["cursor", path.join(cwd, ".cursor", "skills"), false],
      ["kiro", path.join(cwd, ".kiro", "skills"), false],
      ["windsurf", path.join(cwd, ".windsurf", "skills"), false],
      ["trae", path.join(cwd, ".trae", "skills"), false],
      ["qoder", path.join(cwd, ".qoder", "skills"), false],
      ["antigravity", path.join(cwd, ".agents", "skills"), true],
    ]);
  });

  it("detects existing project agent config directories", async () => {
    await mkdir(path.join(tmpDir, ".claude"), { recursive: true });
    await mkdir(path.join(tmpDir, ".cursor"), { recursive: true });
    await mkdir(path.join(tmpDir, ".kiro"), { recursive: true });
    await mkdir(path.join(tmpDir, ".windsurf"), { recursive: true });
    await mkdir(path.join(tmpDir, ".trae"), { recursive: true });
    await mkdir(path.join(tmpDir, ".qoder"), { recursive: true });
    await mkdir(path.join(tmpDir, ".gemini", "antigravity"), { recursive: true });
    await writeFile(path.join(tmpDir, ".opencode"), "not a directory\n");

    await expect(detectProjectAgents({ cwd: tmpDir })).resolves.toEqual([
      "claude-code",
      "cursor",
      "kiro",
      "windsurf",
      "trae",
      "qoder",
      "antigravity",
    ]);
  });
});
