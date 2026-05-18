import path from "node:path";
import { pathExists, safeLstat } from "./fs-safe.js";
import type { AgentDefinition, AgentId, ResolvedAgent, ResolveAgentsOptions } from "./types.js";

export const AGENTS: AgentDefinition[] = [
  {
    id: "codex",
    label: "Codex",
    projectSkillsDir: path.join(".agents", "skills"),
    projectConfigDirs: [".agents", ".codex"],
    globalSkillsDir: (env, homeDir) => path.join(env.CODEX_HOME ?? path.join(homeDir, ".codex"), "skills"),
    projectCanonical: true,
  },
  {
    id: "claude-code",
    label: "Claude Code",
    projectSkillsDir: path.join(".claude", "skills"),
    projectConfigDirs: [".claude"],
    globalSkillsDir: (env, homeDir) => path.join(env.CLAUDE_CONFIG_DIR ?? path.join(homeDir, ".claude"), "skills"),
    projectCanonical: false,
  },
  {
    id: "opencode",
    label: "OpenCode",
    projectSkillsDir: path.join(".agents", "skills"),
    projectScanDirs: [path.join(".agents", "skills"), path.join(".opencode", "skills")],
    projectConfigDirs: [".opencode"],
    globalSkillsDir: (_env, homeDir) => path.join(homeDir, ".config", "opencode", "skills"),
    projectCanonical: true,
  },
  {
    id: "cursor",
    label: "Cursor",
    projectSkillsDir: path.join(".agents", "skills"),
    projectScanDirs: [path.join(".agents", "skills"), path.join(".cursor", "skills")],
    projectConfigDirs: [".cursor"],
    globalSkillsDir: (_env, homeDir) => path.join(homeDir, ".cursor", "skills"),
    projectCanonical: true,
  },
  {
    id: "kiro",
    label: "Kiro",
    projectSkillsDir: path.join(".kiro", "skills"),
    projectConfigDirs: [".kiro"],
    globalSkillsDir: (_env, homeDir) => path.join(homeDir, ".kiro", "skills"),
    projectCanonical: false,
  },
  {
    id: "windsurf",
    label: "Windsurf",
    projectSkillsDir: path.join(".windsurf", "skills"),
    projectConfigDirs: [".windsurf", path.join(".codeium", "windsurf")],
    globalSkillsDir: (_env, homeDir) => path.join(homeDir, ".codeium", "windsurf", "skills"),
    projectCanonical: false,
  },
  {
    id: "trae",
    label: "Trae",
    projectSkillsDir: path.join(".trae", "skills"),
    projectConfigDirs: [".trae"],
    globalSkillsDir: (_env, homeDir) => path.join(homeDir, ".trae", "skills"),
    projectCanonical: false,
  },
  {
    id: "qoder",
    label: "Qoder",
    projectSkillsDir: path.join(".qoder", "skills"),
    projectConfigDirs: [".qoder"],
    globalSkillsDir: (_env, homeDir) => path.join(homeDir, ".qoder", "skills"),
    projectCanonical: false,
  },
  {
    id: "antigravity",
    label: "Antigravity",
    projectSkillsDir: path.join(".agents", "skills"),
    projectConfigDirs: [path.join(".gemini", "antigravity")],
    globalSkillsDir: (_env, homeDir) => path.join(homeDir, ".gemini", "antigravity", "skills"),
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

export function resolveProjectScanAgents(options: ResolveAgentsOptions): ResolvedAgent[] {
  if (options.global) {
    return resolveAgents(options);
  }

  const selectedAgents = options.selectedAgents?.length ? new Set(options.selectedAgents) : undefined;
  const canonicalProjectDir = path.join(options.cwd, ".agents", "skills");
  const resolvedAgents: ResolvedAgent[] = [];
  const seen = new Set<string>();

  for (const agent of AGENTS) {
    if (selectedAgents && !selectedAgents.has(agent.id)) {
      continue;
    }

    for (const projectScanDir of agent.projectScanDirs ?? [agent.projectSkillsDir]) {
      const skillsDir = path.join(options.cwd, projectScanDir);
      const key = `${agent.id}:${skillsDir}`;

      if (seen.has(key)) {
        continue;
      }

      seen.add(key);
      resolvedAgents.push({
        id: agent.id,
        label: agent.label,
        skillsDir,
        isCanonical: path.resolve(skillsDir) === path.resolve(canonicalProjectDir),
      });
    }
  }

  return resolvedAgents;
}

export async function detectProjectAgents(options: { cwd: string }): Promise<AgentId[]> {
  const detected: AgentId[] = [];

  for (const agent of AGENTS) {
    for (const configDir of agent.projectConfigDirs) {
      const configPath = path.join(options.cwd, configDir);
      const stat = await safeLstat(configPath);

      if (stat?.isDirectory()) {
        detected.push(agent.id);
        break;
      }
    }

    if (detected.includes(agent.id)) {
      continue;
    }

    for (const projectScanDir of agent.projectScanDirs ?? [agent.projectSkillsDir]) {
      if (await pathExists(path.join(options.cwd, projectScanDir))) {
        detected.push(agent.id);
        break;
      }
    }
  }

  return detected;
}
