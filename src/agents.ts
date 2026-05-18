import path from "node:path";
import type { AgentDefinition, AgentId, ResolvedAgent, ResolveAgentsOptions } from "./types.js";

export const AGENTS: AgentDefinition[] = [
  {
    id: "codex",
    label: "Codex",
    projectSkillsDir: path.join(".agents", "skills"),
    globalSkillsDir: (env, homeDir) => path.join(env.CODEX_HOME ?? path.join(homeDir, ".codex"), "skills"),
    projectCanonical: true,
  },
  {
    id: "claude-code",
    label: "Claude Code",
    projectSkillsDir: path.join(".claude", "skills"),
    globalSkillsDir: (env, homeDir) => path.join(env.CLAUDE_CONFIG_DIR ?? path.join(homeDir, ".claude"), "skills"),
    projectCanonical: false,
  },
  {
    id: "opencode",
    label: "OpenCode",
    projectSkillsDir: path.join(".agents", "skills"),
    globalSkillsDir: (_env, homeDir) => path.join(homeDir, ".config", "opencode", "skills"),
    projectCanonical: true,
  },
  {
    id: "cursor",
    label: "Cursor",
    projectSkillsDir: path.join(".agents", "skills"),
    globalSkillsDir: (_env, homeDir) => path.join(homeDir, ".cursor", "skills"),
    projectCanonical: true,
  },
];

export function parseAgentId(value: string): AgentId {
  const agent = AGENTS.find((definition) => definition.id === value);

  if (!agent) {
    throw new Error(`Unsupported agent: ${value}`);
  }

  return agent.id;
}

export function getCanonicalDir(options: { cwd: string; homeDir: string; global: boolean }): string {
  return options.global ? path.join(options.homeDir, ".agents", "skills") : path.join(options.cwd, ".agents", "skills");
}

export function resolveAgents(options: ResolveAgentsOptions): ResolvedAgent[] {
  const selectedAgents = options.selectedAgents?.length ? new Set(options.selectedAgents) : undefined;

  return AGENTS.filter((agent) => !selectedAgents || selectedAgents.has(agent.id)).map((agent) => ({
    id: agent.id,
    label: agent.label,
    skillsDir: options.global
      ? agent.globalSkillsDir(options.env, options.homeDir)
      : path.join(options.cwd, agent.projectSkillsDir),
    isCanonical: options.global ? false : agent.projectCanonical,
  }));
}
