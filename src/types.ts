export type AgentId =
  | "codex"
  | "claude-code"
  | "opencode"
  | "cursor"
  | "kiro"
  | "windsurf"
  | "trae"
  | "qoder"
  | "antigravity";

export type LinkStrategy = "symlink-copy-fallback" | "symlink" | "copy";

export interface AgentDefinition {
  id: AgentId;
  label: string;
  projectSkillsDir: string;
  projectScanDirs?: string[];
  projectConfigDirs: string[];
  globalSkillsDir: (env: NodeJS.ProcessEnv, homeDir: string) => string;
  projectCanonical: boolean;
}

export interface ResolvedAgent {
  id: AgentId;
  label: string;
  skillsDir: string;
  isCanonical: boolean;
}

export interface ResolveAgentsOptions {
  cwd: string;
  homeDir: string;
  env: NodeJS.ProcessEnv;
  global: boolean;
  selectedAgents?: AgentId[];
}

export interface ScanWarning {
  agentId: AgentId;
  path: string;
  message: string;
}

export interface ScannedSkill {
  name: string;
  agentId: AgentId;
  sourcePath: string;
  isCanonical: boolean;
  isSymlink: boolean;
  realPath?: string;
  desiredTarget?: boolean;
}

export interface ScanResult {
  skills: ScannedSkill[];
  warnings: ScanWarning[];
}

export type PlanActionKind =
  | "already-canonical"
  | "already-linked"
  | "migrate"
  | "link-identical"
  | "conflict"
  | "skip";

export interface PlanAction {
  kind: PlanActionKind;
  skillName: string;
  source: ScannedSkill;
  canonicalPath: string;
  reason?: string;
}

export interface MigrationPlan {
  canonicalDir: string;
  actions: PlanAction[];
  warnings: ScanWarning[];
}

export interface ApplyResult {
  migrated: PlanAction[];
  linked: PlanAction[];
  skipped: PlanAction[];
  already: PlanAction[];
  failed: Array<{ action: PlanAction; error: Error }>;
  backups: string[];
  connectionWarnings: string[];
}
