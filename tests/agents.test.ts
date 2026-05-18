import path from "node:path";
import { describe, expect, it } from "vitest";
import { getCanonicalDir, resolveAgents, parseAgentId } from "../src/agents.js";

describe("agents", () => {
  const cwd = path.join(path.sep, "repo");
  const homeDir = path.join(path.sep, "home", "user");
  const codexHome = path.join(path.sep, "codex-home");
  const claudeHome = path.join(path.sep, "claude-home");

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
    ]);
  });

  it("resolves global agents with fallback paths", () => {
    const agents = resolveAgents({ cwd, homeDir, env: {}, global: true });
    expect(agents.map((agent) => [agent.id, agent.skillsDir, agent.isCanonical])).toEqual([
      ["codex", path.join(homeDir, ".codex", "skills"), false],
      ["claude-code", path.join(homeDir, ".claude", "skills"), false],
      ["opencode", path.join(homeDir, ".config", "opencode", "skills"), false],
      ["cursor", path.join(homeDir, ".cursor", "skills"), false],
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
    expect(agents.map((agent) => agent.id)).toEqual(["codex", "claude-code", "opencode", "cursor"]);
  });

  it("parses supported agent ids", () => {
    expect(parseAgentId("codex")).toBe("codex");
    expect(parseAgentId("claude-code")).toBe("claude-code");
    expect(parseAgentId("opencode")).toBe("opencode");
    expect(parseAgentId("cursor")).toBe("cursor");
    expect(() => parseAgentId("unknown")).toThrow("Unsupported agent");
  });
});
