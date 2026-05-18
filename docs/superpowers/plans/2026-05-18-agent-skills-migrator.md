# Agent Skills Migrator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a new npm CLI whose MVP migrates existing project or global agent skills into a canonical skills directory and replaces agent-specific copies with Vercel-style relative filesystem symlinks.

**Architecture:** The CLI is a thin command layer over small modules: agent path resolution, scanning, hashing, planning, transactional apply, symlink creation, prompts, and reporting. The canonical store is `.agents/skills` in project mode and `~/.agents/skills` in global mode. Migration is planned first, then applied as small rollback-capable transactions.

**Tech Stack:** TypeScript, ESM, Node.js 18+, Vitest, tsx, @clack/prompts, picocolors.

---

## File Structure

- `package.json`: npm package metadata, bin entry, scripts, dependencies.
- `tsconfig.json`: TypeScript ESM compiler settings.
- `vitest.config.ts`: Vitest config.
- `src/types.ts`: shared types for agents, scanned skills, plans, apply results, and options.
- `src/agents.ts`: built-in Codex, Claude Code, OpenCode, Cursor definitions and project/global path resolution.
- `src/fs-safe.ts`: path expansion, safe stat helpers, temp paths, backup paths, and copy helpers.
- `src/hash.ts`: deterministic skill directory hashing and equality.
- `src/scan.ts`: scan agent directories for valid skills, symlinks, invalid entries, and warnings.
- `src/planner.ts`: group sources by name and build migration actions using multi-agent merge semantics.
- `src/symlink.ts`: Vercel-style relative filesystem symlink helper.
- `src/apply.ts`: transactional migration executor with backup and rollback.
- `src/prompts.ts`: confirmation and conflict prompt wrappers.
- `src/report.ts`: human-readable dry-run and apply output.
- `src/cli.ts`: command parsing and orchestration.
- `bin/cli.mjs`: executable wrapper that imports compiled CLI.
- `tests/agents.test.ts`: agent path resolution tests.
- `tests/hash.test.ts`: content hash tests.
- `tests/scan.test.ts`: scanner tests.
- `tests/planner.test.ts`: merge and conflict planning tests.
- `tests/symlink.test.ts`: Vercel-style symlink behavior tests.
- `tests/apply.test.ts`: transactional apply tests.
- `tests/cli.test.ts`: end-to-end CLI tests.

## Task 1: Package Scaffold

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vitest.config.ts`
- Create: `src/types.ts`
- Create: `src/cli.ts`
- Create: `bin/cli.mjs`

- [ ] **Step 1: Create package metadata**

Create `package.json`:

```json
{
  "name": "agent-skills-migrator",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "bin": {
    "agent-skills-migrator": "./bin/cli.mjs"
  },
  "engines": {
    "node": ">=18"
  },
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc -p tsconfig.json --noEmit"
  },
  "dependencies": {
    "@clack/prompts": "^0.10.1",
    "picocolors": "^1.1.1"
  },
  "devDependencies": {
    "@types/node": "^22.15.21",
    "tsx": "^4.19.4",
    "typescript": "^5.8.3",
    "vitest": "^3.1.4"
  }
}
```

- [ ] **Step 2: Create TypeScript config**

Create `tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "lib": ["ES2022"],
    "types": ["node"],
    "strict": true,
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true,
    "skipLibCheck": true,
    "outDir": "dist",
    "rootDir": "."
  },
  "include": ["src/**/*.ts", "tests/**/*.ts", "vitest.config.ts"]
}
```

- [ ] **Step 3: Create Vitest config**

Create `vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    testTimeout: 10000,
  },
});
```

- [ ] **Step 4: Create shared initial types**

Create `src/types.ts`:

```ts
export type AgentId = "codex" | "claude-code" | "opencode" | "cursor";

export interface AgentDefinition {
  id: AgentId;
  label: string;
  projectSkillsDir: string;
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
}
```

- [ ] **Step 5: Create placeholder CLI entry**

Create `src/cli.ts`:

```ts
export async function main(argv = process.argv.slice(2)): Promise<void> {
  if (argv[0] !== "migrate") {
    console.error("Usage: agent-skills-migrator migrate [--global] [--dry-run] [--yes] [--agent <id>]");
    process.exitCode = 1;
    return;
  }

  console.log("agent-skills-migrator migrate is not implemented yet");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
```

- [ ] **Step 6: Create bin wrapper**

Create `bin/cli.mjs`:

```js
#!/usr/bin/env node
import { main } from "../dist/src/cli.js";

await main();
```

- [ ] **Step 7: Install dependencies**

Run: `npm install`

Expected: dependencies install and `package-lock.json` is created.

- [ ] **Step 8: Build**

Run: `npm run build`

Expected: PASS and `dist/src/cli.js` exists.

- [ ] **Step 9: Commit**

If the workspace is a git repository, run:

```bash
git add package.json package-lock.json tsconfig.json vitest.config.ts src/types.ts src/cli.ts bin/cli.mjs
git commit -m "chore: scaffold agent skills migrator"
```

If the workspace is not a git repository, record "commit skipped: not a git repository" in the task notes.

## Task 2: Agent Definitions and Path Resolution

**Files:**
- Create: `src/agents.ts`
- Create: `tests/agents.test.ts`
- Modify: `src/types.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/agents.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { getCanonicalDir, resolveAgents, parseAgentId } from "../src/agents.js";

describe("agents", () => {
  const cwd = "/repo";
  const homeDir = "/home/user";

  it("uses .agents/skills as project canonical", () => {
    expect(getCanonicalDir({ cwd, homeDir, global: false })).toBe("/repo/.agents/skills");
  });

  it("uses ~/.agents/skills as global canonical", () => {
    expect(getCanonicalDir({ cwd, homeDir, global: true })).toBe("/home/user/.agents/skills");
  });

  it("resolves project agents", () => {
    const agents = resolveAgents({ cwd, homeDir, env: {}, global: false });
    expect(agents.map((agent) => [agent.id, agent.skillsDir, agent.isCanonical])).toEqual([
      ["codex", "/repo/.agents/skills", true],
      ["claude-code", "/repo/.claude/skills", false],
      ["opencode", "/repo/.agents/skills", true],
      ["cursor", "/repo/.agents/skills", true],
    ]);
  });

  it("resolves global agents with environment overrides", () => {
    const agents = resolveAgents({
      cwd,
      homeDir,
      env: { CODEX_HOME: "/codex-home", CLAUDE_CONFIG_DIR: "/claude-home" },
      global: true,
    });
    expect(agents.map((agent) => [agent.id, agent.skillsDir, agent.isCanonical])).toEqual([
      ["codex", "/codex-home/skills", false],
      ["claude-code", "/claude-home/skills", false],
      ["opencode", "/home/user/.config/opencode/skills", false],
      ["cursor", "/home/user/.cursor/skills", false],
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

  it("parses supported agent ids", () => {
    expect(parseAgentId("codex")).toBe("codex");
    expect(parseAgentId("claude-code")).toBe("claude-code");
    expect(() => parseAgentId("unknown")).toThrow("Unsupported agent");
  });
});
```

- [ ] **Step 2: Run tests to verify failure**

Run: `npm test -- tests/agents.test.ts`

Expected: FAIL because `src/agents.ts` does not exist.

- [ ] **Step 3: Implement agent definitions**

Create `src/agents.ts`:

```ts
import path from "node:path";
import type { AgentDefinition, AgentId, ResolvedAgent, ResolveAgentsOptions } from "./types.js";

export const AGENTS: AgentDefinition[] = [
  {
    id: "codex",
    label: "Codex",
    projectSkillsDir: ".agents/skills",
    globalSkillsDir: (env, homeDir) => path.join(env.CODEX_HOME ?? path.join(homeDir, ".codex"), "skills"),
    projectCanonical: true,
  },
  {
    id: "claude-code",
    label: "Claude Code",
    projectSkillsDir: ".claude/skills",
    globalSkillsDir: (env, homeDir) => path.join(env.CLAUDE_CONFIG_DIR ?? path.join(homeDir, ".claude"), "skills"),
    projectCanonical: false,
  },
  {
    id: "opencode",
    label: "OpenCode",
    projectSkillsDir: ".agents/skills",
    globalSkillsDir: (_env, homeDir) => path.join(homeDir, ".config", "opencode", "skills"),
    projectCanonical: true,
  },
  {
    id: "cursor",
    label: "Cursor",
    projectSkillsDir: ".agents/skills",
    globalSkillsDir: (_env, homeDir) => path.join(homeDir, ".cursor", "skills"),
    projectCanonical: true,
  },
];

export function parseAgentId(value: string): AgentId {
  const match = AGENTS.find((agent) => agent.id === value);
  if (!match) {
    throw new Error(`Unsupported agent: ${value}`);
  }
  return match.id;
}

export function getCanonicalDir(options: { cwd: string; homeDir: string; global: boolean }): string {
  return options.global
    ? path.join(options.homeDir, ".agents", "skills")
    : path.join(options.cwd, ".agents", "skills");
}

export function resolveAgents(options: ResolveAgentsOptions): ResolvedAgent[] {
  const selected = new Set(options.selectedAgents);
  return AGENTS.filter((agent) => selected.size === 0 || selected.has(agent.id)).map((agent) => ({
    id: agent.id,
    label: agent.label,
    skillsDir: options.global
      ? agent.globalSkillsDir(options.env, options.homeDir)
      : path.join(options.cwd, agent.projectSkillsDir),
    isCanonical: options.global ? false : agent.projectCanonical,
  }));
}
```

- [ ] **Step 4: Run tests**

Run: `npm test -- tests/agents.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

If git is available:

```bash
git add src/agents.ts tests/agents.test.ts
git commit -m "feat: resolve supported agent paths"
```

## Task 3: Filesystem Safety Helpers

**Files:**
- Create: `src/fs-safe.ts`
- Create: `tests/fs-safe.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/fs-safe.test.ts`:

```ts
import { mkdtemp, mkdir, writeFile, lstat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { copyDir, makeBackupPath, makeTempPath, pathExists, safeLstat } from "../src/fs-safe.js";

describe("fs-safe", () => {
  it("checks whether a path exists", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "asm-fs-"));
    const file = path.join(root, "file.txt");
    await writeFile(file, "hello");
    await expect(pathExists(file)).resolves.toBe(true);
    await expect(pathExists(path.join(root, "missing"))).resolves.toBe(false);
  });

  it("returns undefined for missing lstat paths", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "asm-fs-"));
    await expect(safeLstat(path.join(root, "missing"))).resolves.toBeUndefined();
  });

  it("creates deterministic temp and backup paths under expected parents", () => {
    expect(makeTempPath("/repo/.agents/skills", "foo", "123")).toBe("/repo/.agents/.tmp/foo-123");
    expect(makeBackupPath("/repo/.claude/skills/foo", "123")).toBe("/repo/.claude/skills/foo.backup-123");
  });

  it("copies a directory recursively", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "asm-copy-"));
    const source = path.join(root, "source");
    const dest = path.join(root, "dest");
    await mkdir(path.join(source, "nested"), { recursive: true });
    await writeFile(path.join(source, "SKILL.md"), "name");
    await writeFile(path.join(source, "nested", "a.txt"), "a");

    await copyDir(source, dest);

    await expect(lstat(path.join(dest, "SKILL.md"))).resolves.toBeDefined();
    await expect(lstat(path.join(dest, "nested", "a.txt"))).resolves.toBeDefined();
  });
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `npm test -- tests/fs-safe.test.ts`

Expected: FAIL because `src/fs-safe.ts` does not exist.

- [ ] **Step 3: Implement fs helpers**

Create `src/fs-safe.ts`:

```ts
import { cp, lstat } from "node:fs/promises";
import path from "node:path";

export async function pathExists(filePath: string): Promise<boolean> {
  try {
    await lstat(filePath);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return false;
    }
    throw error;
  }
}

export async function safeLstat(filePath: string) {
  try {
    return await lstat(filePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return undefined;
    }
    throw error;
  }
}

export function makeTempPath(canonicalDir: string, skillName: string, stamp: string): string {
  return path.join(path.dirname(canonicalDir), ".tmp", `${skillName}-${stamp}`);
}

export function makeBackupPath(sourcePath: string, stamp: string): string {
  return `${sourcePath}.backup-${stamp}`;
}

export async function copyDir(source: string, dest: string): Promise<void> {
  await cp(source, dest, {
    recursive: true,
    errorOnExist: true,
    force: false,
    verbatimSymlinks: true,
  });
}
```

- [ ] **Step 4: Run tests**

Run: `npm test -- tests/fs-safe.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

If git is available:

```bash
git add src/fs-safe.ts tests/fs-safe.test.ts
git commit -m "feat: add safe filesystem helpers"
```

## Task 4: Directory Hashing

**Files:**
- Create: `src/hash.ts`
- Create: `tests/hash.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/hash.test.ts`:

```ts
import { mkdtemp, mkdir, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { hashSkillDir, skillsHaveSameContent } from "../src/hash.js";

async function makeSkill(root: string, name: string, files: Record<string, string>) {
  const dir = path.join(root, name);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, "SKILL.md"), files["SKILL.md"] ?? "# Skill");
  for (const [relativePath, content] of Object.entries(files)) {
    if (relativePath === "SKILL.md") continue;
    const filePath = path.join(dir, relativePath);
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, content);
  }
  return dir;
}

describe("hashSkillDir", () => {
  it("returns same hash for same content regardless of creation order", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "asm-hash-"));
    const a = await makeSkill(root, "a", { "SKILL.md": "skill", "nested/a.txt": "a", "b.txt": "b" });
    const b = await makeSkill(root, "b", { "b.txt": "b", "SKILL.md": "skill", "nested/a.txt": "a" });
    await expect(skillsHaveSameContent(a, b)).resolves.toBe(true);
  });

  it("ignores noise files", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "asm-hash-"));
    const a = await makeSkill(root, "a", { "SKILL.md": "skill" });
    const b = await makeSkill(root, "b", { "SKILL.md": "skill", ".DS_Store": "noise" });
    await expect(skillsHaveSameContent(a, b)).resolves.toBe(true);
  });

  it("detects different content", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "asm-hash-"));
    const a = await makeSkill(root, "a", { "SKILL.md": "skill", "a.txt": "one" });
    const b = await makeSkill(root, "b", { "SKILL.md": "skill", "a.txt": "two" });
    await expect(skillsHaveSameContent(a, b)).resolves.toBe(false);
  });

  it("warns and marks unsafe external symlink", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "asm-hash-"));
    const external = path.join(root, "external.txt");
    await writeFile(external, "external");
    const skill = await makeSkill(root, "skill", { "SKILL.md": "skill" });
    await symlink(external, path.join(skill, "external-link"));

    const result = await hashSkillDir(skill);

    expect(result.safe).toBe(false);
    expect(result.warnings[0]).toContain("resolves outside");
  });
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `npm test -- tests/hash.test.ts`

Expected: FAIL because `src/hash.ts` does not exist.

- [ ] **Step 3: Implement hashing**

Create `src/hash.ts`:

```ts
import { createHash } from "node:crypto";
import { lstat, readFile, readdir, realpath, stat } from "node:fs/promises";
import path from "node:path";

const IGNORED_NAMES = new Set([".DS_Store", ".git", "__pycache__"]);

export interface HashResult {
  hash: string;
  safe: boolean;
  warnings: string[];
}

export async function hashSkillDir(skillDir: string): Promise<HashResult> {
  const rootRealPath = await realpath(skillDir);
  const hash = createHash("sha256");
  const warnings: string[] = [];
  let safe = true;

  async function walk(dir: string): Promise<void> {
    const entries = await readdir(dir, { withFileTypes: true });
    entries.sort((a, b) => a.name.localeCompare(b.name));

    for (const entry of entries) {
      if (IGNORED_NAMES.has(entry.name) || entry.name.includes(".backup-")) {
        continue;
      }

      const absolutePath = path.join(dir, entry.name);
      const relativePath = path.relative(skillDir, absolutePath);

      if (entry.isDirectory()) {
        if (entry.name === ".tmp") {
          continue;
        }
        await walk(absolutePath);
        continue;
      }

      if (entry.isSymbolicLink()) {
        let targetRealPath: string;
        try {
          targetRealPath = await realpath(absolutePath);
        } catch {
          safe = false;
          warnings.push(`${relativePath} is a broken symlink`);
          continue;
        }
        const relativeToRoot = path.relative(rootRealPath, targetRealPath);
        if (relativeToRoot.startsWith("..") || path.isAbsolute(relativeToRoot)) {
          safe = false;
          warnings.push(`${relativePath} resolves outside skill directory`);
          continue;
        }
        const targetStat = await stat(absolutePath);
        if (!targetStat.isFile()) {
          safe = false;
          warnings.push(`${relativePath} is not an internal file symlink`);
          continue;
        }
      }

      const entryStat = await lstat(absolutePath);
      if (!entryStat.isFile() && !entryStat.isSymbolicLink()) {
        continue;
      }

      hash.update(relativePath);
      hash.update("\0");
      hash.update(await readFile(absolutePath));
      hash.update("\0");
    }
  }

  await walk(skillDir);
  return { hash: hash.digest("hex"), safe, warnings };
}

export async function skillsHaveSameContent(a: string, b: string): Promise<boolean> {
  const [left, right] = await Promise.all([hashSkillDir(a), hashSkillDir(b)]);
  return left.safe && right.safe && left.hash === right.hash;
}
```

- [ ] **Step 4: Run tests**

Run: `npm test -- tests/hash.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

If git is available:

```bash
git add src/hash.ts tests/hash.test.ts
git commit -m "feat: hash skill directories safely"
```

## Task 5: Skill Scanner

**Files:**
- Create: `src/scan.ts`
- Create: `tests/scan.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/scan.test.ts`:

```ts
import { mkdtemp, mkdir, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { scanAgentSkills } from "../src/scan.js";
import type { ResolvedAgent } from "../src/types.js";

async function makeRoot() {
  return mkdtemp(path.join(os.tmpdir(), "asm-scan-"));
}

function agent(skillsDir: string): ResolvedAgent {
  return { id: "claude-code", label: "Claude Code", skillsDir, isCanonical: false };
}

describe("scanAgentSkills", () => {
  it("finds first-level directories containing SKILL.md", async () => {
    const root = await makeRoot();
    const skillsDir = path.join(root, ".claude", "skills");
    await mkdir(path.join(skillsDir, "foo"), { recursive: true });
    await mkdir(path.join(skillsDir, "not-a-skill"), { recursive: true });
    await writeFile(path.join(skillsDir, "foo", "SKILL.md"), "foo");
    await writeFile(path.join(skillsDir, "plain.txt"), "no");

    const result = await scanAgentSkills([agent(skillsDir)]);

    expect(result.skills.map((skill) => skill.name)).toEqual(["foo"]);
    expect(result.warnings).toEqual([]);
  });

  it("returns no skills when directory is missing", async () => {
    const root = await makeRoot();
    const result = await scanAgentSkills([agent(path.join(root, "missing"))]);
    expect(result.skills).toEqual([]);
  });

  it("detects skill symlinks and real paths", async () => {
    const root = await makeRoot();
    const canonical = path.join(root, ".agents", "skills", "foo");
    const skillsDir = path.join(root, ".claude", "skills");
    await mkdir(canonical, { recursive: true });
    await mkdir(skillsDir, { recursive: true });
    await writeFile(path.join(canonical, "SKILL.md"), "foo");
    await symlink(canonical, path.join(skillsDir, "foo"));

    const result = await scanAgentSkills([agent(skillsDir)]);

    expect(result.skills[0]).toMatchObject({ name: "foo", isSymlink: true });
    expect(result.skills[0].realPath).toBe(canonical);
  });

  it("warns on broken symlinks", async () => {
    const root = await makeRoot();
    const skillsDir = path.join(root, ".claude", "skills");
    await mkdir(skillsDir, { recursive: true });
    await symlink(path.join(root, "missing"), path.join(skillsDir, "foo"));

    const result = await scanAgentSkills([agent(skillsDir)]);

    expect(result.skills).toEqual([]);
    expect(result.warnings[0].message).toContain("broken symlink");
  });
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `npm test -- tests/scan.test.ts`

Expected: FAIL because `src/scan.ts` does not exist.

- [ ] **Step 3: Implement scanner**

Create `src/scan.ts`:

```ts
import { readdir, realpath } from "node:fs/promises";
import path from "node:path";
import { pathExists, safeLstat } from "./fs-safe.js";
import type { ResolvedAgent, ScanResult, ScannedSkill } from "./types.js";

export async function scanAgentSkills(agents: ResolvedAgent[]): Promise<ScanResult> {
  const skills: ScannedSkill[] = [];
  const warnings: ScanResult["warnings"] = [];

  for (const agent of agents) {
    const dirStat = await safeLstat(agent.skillsDir);
    if (!dirStat) {
      continue;
    }
    if (!dirStat.isDirectory() && !dirStat.isSymbolicLink()) {
      warnings.push({ agentId: agent.id, path: agent.skillsDir, message: "skills path is not a directory" });
      continue;
    }

    const entries = await readdir(agent.skillsDir, { withFileTypes: true });
    entries.sort((a, b) => a.name.localeCompare(b.name));

    for (const entry of entries) {
      const sourcePath = path.join(agent.skillsDir, entry.name);
      const entryStat = await safeLstat(sourcePath);
      if (!entryStat) {
        continue;
      }

      if (entryStat.isSymbolicLink()) {
        let resolved: string;
        try {
          resolved = await realpath(sourcePath);
        } catch {
          warnings.push({ agentId: agent.id, path: sourcePath, message: "broken symlink" });
          continue;
        }
        if (!(await pathExists(path.join(sourcePath, "SKILL.md")))) {
          continue;
        }
        skills.push({
          name: entry.name,
          agentId: agent.id,
          sourcePath,
          isCanonical: agent.isCanonical,
          isSymlink: true,
          realPath: resolved,
        });
        continue;
      }

      if (!entryStat.isDirectory()) {
        continue;
      }
      if (!(await pathExists(path.join(sourcePath, "SKILL.md")))) {
        continue;
      }
      skills.push({
        name: entry.name,
        agentId: agent.id,
        sourcePath,
        isCanonical: agent.isCanonical,
        isSymlink: false,
      });
    }
  }

  return { skills, warnings };
}
```

- [ ] **Step 4: Run tests**

Run: `npm test -- tests/scan.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

If git is available:

```bash
git add src/scan.ts tests/scan.test.ts
git commit -m "feat: scan agent skill directories"
```

## Task 6: Vercel-Style Relative Symlink Helper

**Files:**
- Create: `src/symlink.ts`
- Create: `tests/symlink.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/symlink.test.ts`:

```ts
import { mkdtemp, mkdir, readlink, realpath, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createRelativeSymlink } from "../src/symlink.js";

describe("createRelativeSymlink", () => {
  it("creates a relative filesystem symlink", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "asm-link-"));
    const target = path.join(root, ".agents", "skills", "foo");
    const link = path.join(root, ".claude", "skills", "foo");
    await mkdir(target, { recursive: true });
    await mkdir(path.dirname(link), { recursive: true });
    await writeFile(path.join(target, "SKILL.md"), "foo");

    await createRelativeSymlink(target, link);

    expect(await readlink(link)).toBe("../../.agents/skills/foo");
    expect(await realpath(link)).toBe(await realpath(target));
  });

  it("treats an existing correct symlink as satisfied", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "asm-link-"));
    const target = path.join(root, ".agents", "skills", "foo");
    const link = path.join(root, ".claude", "skills", "foo");
    await mkdir(target, { recursive: true });
    await mkdir(path.dirname(link), { recursive: true });
    await symlink("../../.agents/skills/foo", link);

    const result = await createRelativeSymlink(target, link);

    expect(result.status).toBe("already-linked");
  });

  it("uses real parent path when link parent is a symlink", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "asm-link-"));
    const target = path.join(root, ".agents", "skills", "foo");
    const realSkills = path.join(root, "real-claude-skills");
    const linkedSkills = path.join(root, ".claude", "skills");
    const link = path.join(linkedSkills, "foo");
    await mkdir(target, { recursive: true });
    await mkdir(realSkills, { recursive: true });
    await mkdir(path.dirname(linkedSkills), { recursive: true });
    await symlink(realSkills, linkedSkills);

    await createRelativeSymlink(target, link);

    expect(await realpath(link)).toBe(await realpath(target));
  });
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `npm test -- tests/symlink.test.ts`

Expected: FAIL because `src/symlink.ts` does not exist.

- [ ] **Step 3: Implement symlink helper**

Create `src/symlink.ts`:

```ts
import { lstat, mkdir, readlink, realpath, symlink } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

export type SymlinkResult = { status: "created" | "already-linked" | "same-realpath" };

async function safeRealpath(filePath: string): Promise<string | undefined> {
  try {
    return await realpath(filePath);
  } catch {
    return undefined;
  }
}

async function safeLstat(filePath: string) {
  try {
    return await lstat(filePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return undefined;
    }
    throw error;
  }
}

async function resolveParentSymlinks(linkPath: string): Promise<string> {
  const parent = path.dirname(linkPath);
  const resolvedParent = await safeRealpath(parent);
  return path.join(resolvedParent ?? parent, path.basename(linkPath));
}

export async function createRelativeSymlink(target: string, linkPath: string): Promise<SymlinkResult> {
  const targetRealPath = await realpath(target);
  const existingRealPath = await safeRealpath(linkPath);
  if (existingRealPath && existingRealPath === targetRealPath) {
    return { status: "same-realpath" };
  }

  const existingStat = await safeLstat(linkPath);
  if (existingStat?.isSymbolicLink()) {
    const rawTarget = await readlink(linkPath);
    const resolvedExistingTarget = path.resolve(path.dirname(linkPath), rawTarget);
    const existingTargetRealPath = await safeRealpath(resolvedExistingTarget);
    if (existingTargetRealPath === targetRealPath) {
      return { status: "already-linked" };
    }
    throw new Error(`Existing symlink points elsewhere: ${linkPath}`);
  }
  if (existingStat) {
    throw new Error(`Link path already exists: ${linkPath}`);
  }

  await mkdir(path.dirname(linkPath), { recursive: true });
  const realLinkPath = await resolveParentSymlinks(linkPath);
  const relativeTarget = path.relative(path.dirname(realLinkPath), target);
  const symlinkType = os.platform() === "win32" ? "junction" : undefined;
  await symlink(relativeTarget, linkPath, symlinkType);
  return { status: "created" };
}
```

- [ ] **Step 4: Run tests**

Run: `npm test -- tests/symlink.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

If git is available:

```bash
git add src/symlink.ts tests/symlink.test.ts
git commit -m "feat: create relative skill symlinks"
```

## Task 7: Migration Planner

**Files:**
- Create: `src/planner.ts`
- Create: `tests/planner.test.ts`
- Modify: `src/types.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/planner.test.ts`:

```ts
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createMigrationPlan } from "../src/planner.js";
import type { ScanResult, ScannedSkill } from "../src/types.js";

async function skill(root: string, relative: string, content: string) {
  const dir = path.join(root, relative);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, "SKILL.md"), content);
  return dir;
}

function scanned(name: string, agentId: ScannedSkill["agentId"], sourcePath: string, isCanonical: boolean): ScannedSkill {
  return { name, agentId, sourcePath, isCanonical, isSymlink: false };
}

describe("createMigrationPlan", () => {
  it("keeps canonical skills as already canonical", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "asm-plan-"));
    const canonicalDir = path.join(root, ".agents", "skills");
    const foo = await skill(root, ".agents/skills/foo", "foo");
    const scan: ScanResult = { skills: [scanned("foo", "codex", foo, true)], warnings: [] };

    const plan = await createMigrationPlan(scan, { canonicalDir, yes: false });

    expect(plan.actions.map((action) => action.kind)).toEqual(["already-canonical"]);
  });

  it("migrates non-canonical skill when canonical missing", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "asm-plan-"));
    const canonicalDir = path.join(root, ".agents", "skills");
    const foo = await skill(root, ".claude/skills/foo", "foo");
    const scan: ScanResult = { skills: [scanned("foo", "claude-code", foo, false)], warnings: [] };

    const plan = await createMigrationPlan(scan, { canonicalDir, yes: false });

    expect(plan.actions[0]).toMatchObject({
      kind: "migrate",
      skillName: "foo",
      canonicalPath: path.join(canonicalDir, "foo"),
    });
  });

  it("links identical non-canonical skill to existing canonical", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "asm-plan-"));
    const canonicalDir = path.join(root, ".agents", "skills");
    const canonical = await skill(root, ".agents/skills/foo", "foo");
    const claude = await skill(root, ".claude/skills/foo", "foo");
    const scan: ScanResult = {
      skills: [scanned("foo", "codex", canonical, true), scanned("foo", "claude-code", claude, false)],
      warnings: [],
    };

    const plan = await createMigrationPlan(scan, { canonicalDir, yes: false });

    expect(plan.actions.map((action) => action.kind)).toEqual(["already-canonical", "link-identical"]);
  });

  it("marks different same-name content as conflict", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "asm-plan-"));
    const canonicalDir = path.join(root, ".agents", "skills");
    const canonical = await skill(root, ".agents/skills/foo", "foo");
    const claude = await skill(root, ".claude/skills/foo", "bar");
    const scan: ScanResult = {
      skills: [scanned("foo", "codex", canonical, true), scanned("foo", "claude-code", claude, false)],
      warnings: [],
    };

    const plan = await createMigrationPlan(scan, { canonicalDir, yes: true });

    expect(plan.actions.map((action) => action.kind)).toEqual(["already-canonical", "skip"]);
    expect(plan.actions[1].reason).toContain("conflict");
  });
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `npm test -- tests/planner.test.ts`

Expected: FAIL because `src/planner.ts` does not exist.

- [ ] **Step 3: Implement planner**

Create `src/planner.ts`:

```ts
import path from "node:path";
import { realpath } from "node:fs/promises";
import { skillsHaveSameContent } from "./hash.js";
import { pathExists } from "./fs-safe.js";
import type { MigrationPlan, PlanAction, ScanResult, ScannedSkill } from "./types.js";

export interface CreateMigrationPlanOptions {
  canonicalDir: string;
  yes: boolean;
}

async function isAlreadyLinked(source: ScannedSkill, canonicalPath: string): Promise<boolean> {
  if (!source.isSymlink) {
    return false;
  }
  try {
    return (await realpath(source.sourcePath)) === (await realpath(canonicalPath));
  } catch {
    return false;
  }
}

function sortSources(sources: ScannedSkill[]): ScannedSkill[] {
  return [...sources].sort((a, b) => {
    if (a.isCanonical !== b.isCanonical) {
      return a.isCanonical ? -1 : 1;
    }
    const agentOrder = a.agentId.localeCompare(b.agentId);
    if (agentOrder !== 0) {
      return agentOrder;
    }
    return a.sourcePath.localeCompare(b.sourcePath);
  });
}

export async function createMigrationPlan(
  scan: ScanResult,
  options: CreateMigrationPlanOptions,
): Promise<MigrationPlan> {
  const actions: PlanAction[] = [];
  const byName = new Map<string, ScannedSkill[]>();

  for (const skill of scan.skills) {
    const list = byName.get(skill.name) ?? [];
    list.push(skill);
    byName.set(skill.name, list);
  }

  for (const [skillName, unsortedSources] of [...byName.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const canonicalPath = path.join(options.canonicalDir, skillName);
    const sources = sortSources(unsortedSources);
    let canonicalExists = await pathExists(canonicalPath);

    for (const source of sources) {
      if (source.isCanonical) {
        actions.push({ kind: "already-canonical", skillName, source, canonicalPath });
        canonicalExists = true;
        continue;
      }

      if (await isAlreadyLinked(source, canonicalPath)) {
        actions.push({ kind: "already-linked", skillName, source, canonicalPath });
        canonicalExists = true;
        continue;
      }

      if (!canonicalExists) {
        actions.push({ kind: "migrate", skillName, source, canonicalPath });
        canonicalExists = true;
        continue;
      }

      const same = await skillsHaveSameContent(source.sourcePath, canonicalPath);
      if (same) {
        actions.push({ kind: "link-identical", skillName, source, canonicalPath });
        continue;
      }

      actions.push({
        kind: options.yes ? "skip" : "conflict",
        skillName,
        source,
        canonicalPath,
        reason: "same-name content conflict",
      });
    }
  }

  return { canonicalDir: options.canonicalDir, actions, warnings: scan.warnings };
}
```

- [ ] **Step 4: Run tests**

Run: `npm test -- tests/planner.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

If git is available:

```bash
git add src/planner.ts tests/planner.test.ts
git commit -m "feat: plan multi-agent skill migrations"
```

## Task 8: Transactional Apply

**Files:**
- Create: `src/apply.ts`
- Create: `tests/apply.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/apply.test.ts`:

```ts
import { lstat, mkdtemp, mkdir, readFile, realpath, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { applyMigrationPlan } from "../src/apply.js";
import type { MigrationPlan, PlanAction, ScannedSkill } from "../src/types.js";

async function makeSkill(dir: string, content: string) {
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, "SKILL.md"), content);
}

function action(kind: PlanAction["kind"], sourcePath: string, canonicalPath: string): PlanAction {
  const source: ScannedSkill = {
    name: path.basename(sourcePath),
    agentId: "claude-code",
    sourcePath,
    isCanonical: false,
    isSymlink: false,
  };
  return { kind, skillName: path.basename(sourcePath), source, canonicalPath };
}

describe("applyMigrationPlan", () => {
  it("copies a source skill to canonical and replaces source with symlink", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "asm-apply-"));
    const source = path.join(root, ".claude", "skills", "foo");
    const canonical = path.join(root, ".agents", "skills", "foo");
    await makeSkill(source, "foo");
    const plan: MigrationPlan = {
      canonicalDir: path.dirname(canonical),
      warnings: [],
      actions: [action("migrate", source, canonical)],
    };

    const result = await applyMigrationPlan(plan, { stamp: "20260518120000" });

    expect(await readFile(path.join(canonical, "SKILL.md"), "utf8")).toBe("foo");
    expect((await lstat(source)).isSymbolicLink()).toBe(true);
    expect(await realpath(source)).toBe(await realpath(canonical));
    expect(result.migrated).toHaveLength(1);
    expect(result.backups[0]).toContain("foo.backup-20260518120000");
  });

  it("links identical source without copying canonical", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "asm-apply-"));
    const source = path.join(root, ".claude", "skills", "foo");
    const canonical = path.join(root, ".agents", "skills", "foo");
    await makeSkill(source, "foo");
    await makeSkill(canonical, "foo");
    const plan: MigrationPlan = {
      canonicalDir: path.dirname(canonical),
      warnings: [],
      actions: [action("link-identical", source, canonical)],
    };

    const result = await applyMigrationPlan(plan, { stamp: "20260518120000" });

    expect((await lstat(source)).isSymbolicLink()).toBe(true);
    expect(await realpath(source)).toBe(await realpath(canonical));
    expect(result.linked).toHaveLength(1);
  });

  it("does not modify skipped actions", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "asm-apply-"));
    const source = path.join(root, ".claude", "skills", "foo");
    const canonical = path.join(root, ".agents", "skills", "foo");
    await makeSkill(source, "foo");
    const plan: MigrationPlan = {
      canonicalDir: path.dirname(canonical),
      warnings: [],
      actions: [action("skip", source, canonical)],
    };

    const result = await applyMigrationPlan(plan, { stamp: "20260518120000" });

    expect((await lstat(source)).isDirectory()).toBe(true);
    expect(result.skipped).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `npm test -- tests/apply.test.ts`

Expected: FAIL because `src/apply.ts` does not exist.

- [ ] **Step 3: Implement apply**

Create `src/apply.ts`:

```ts
import { mkdir, rename, rm } from "node:fs/promises";
import path from "node:path";
import { copyDir, makeBackupPath, makeTempPath, pathExists } from "./fs-safe.js";
import { createRelativeSymlink } from "./symlink.js";
import type { ApplyResult, MigrationPlan, PlanAction } from "./types.js";

export interface ApplyOptions {
  stamp: string;
}

function emptyResult(): ApplyResult {
  return { migrated: [], linked: [], skipped: [], already: [], failed: [], backups: [] };
}

async function replaceSourceWithSymlink(action: PlanAction, stamp: string, result: ApplyResult): Promise<void> {
  const backupPath = makeBackupPath(action.source.sourcePath, stamp);
  await rename(action.source.sourcePath, backupPath);
  result.backups.push(backupPath);

  try {
    await createRelativeSymlink(action.canonicalPath, action.source.sourcePath);
  } catch (error) {
    await rm(action.source.sourcePath, { recursive: true, force: true });
    await rename(backupPath, action.source.sourcePath);
    throw error;
  }
}

async function applyAction(action: PlanAction, options: ApplyOptions, result: ApplyResult): Promise<void> {
  if (action.kind === "already-canonical" || action.kind === "already-linked") {
    result.already.push(action);
    return;
  }
  if (action.kind === "skip" || action.kind === "conflict") {
    result.skipped.push(action);
    return;
  }
  if (action.kind === "migrate") {
    await mkdir(path.dirname(action.canonicalPath), { recursive: true });
    const tempPath = makeTempPath(path.dirname(action.canonicalPath), action.skillName, options.stamp);
    await rm(tempPath, { recursive: true, force: true });
    await mkdir(path.dirname(tempPath), { recursive: true });
    await copyDir(action.source.sourcePath, tempPath);
    if (!(await pathExists(path.join(tempPath, "SKILL.md")))) {
      throw new Error(`Temporary skill copy is missing SKILL.md: ${tempPath}`);
    }
    await rename(tempPath, action.canonicalPath);
    await replaceSourceWithSymlink(action, options.stamp, result);
    result.migrated.push(action);
    return;
  }
  if (action.kind === "link-identical") {
    await replaceSourceWithSymlink(action, options.stamp, result);
    result.linked.push(action);
  }
}

export async function applyMigrationPlan(plan: MigrationPlan, options: ApplyOptions): Promise<ApplyResult> {
  const result = emptyResult();
  for (const action of plan.actions) {
    try {
      await applyAction(action, options, result);
    } catch (error) {
      result.failed.push({ action, error: error instanceof Error ? error : new Error(String(error)) });
    }
  }
  return result;
}
```

- [ ] **Step 4: Run tests**

Run: `npm test -- tests/apply.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

If git is available:

```bash
git add src/apply.ts tests/apply.test.ts
git commit -m "feat: apply skill migrations transactionally"
```

## Task 9: Reporting and Prompts

**Files:**
- Create: `src/report.ts`
- Create: `src/prompts.ts`
- Create: `tests/report.test.ts`

- [ ] **Step 1: Write failing report tests**

Create `tests/report.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { formatPlanReport, formatApplyReport } from "../src/report.js";
import type { ApplyResult, MigrationPlan, PlanAction, ScannedSkill } from "../src/types.js";

const source: ScannedSkill = {
  name: "foo",
  agentId: "claude-code",
  sourcePath: "/repo/.claude/skills/foo",
  isCanonical: false,
  isSymlink: false,
};

const action: PlanAction = {
  kind: "migrate",
  skillName: "foo",
  source,
  canonicalPath: "/repo/.agents/skills/foo",
};

describe("report", () => {
  it("formats a dry-run plan", () => {
    const plan: MigrationPlan = { canonicalDir: "/repo/.agents/skills", actions: [action], warnings: [] };
    expect(formatPlanReport(plan)).toContain("foo: migrate");
  });

  it("formats apply results", () => {
    const result: ApplyResult = {
      migrated: [action],
      linked: [],
      skipped: [],
      already: [],
      failed: [],
      backups: ["/repo/.claude/skills/foo.backup-20260518120000"],
    };
    expect(formatApplyReport(result)).toContain("Migrated: 1");
    expect(formatApplyReport(result)).toContain("Backups:");
  });
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `npm test -- tests/report.test.ts`

Expected: FAIL because `src/report.ts` does not exist.

- [ ] **Step 3: Implement reports**

Create `src/report.ts`:

```ts
import pc from "picocolors";
import type { ApplyResult, MigrationPlan } from "./types.js";

export function formatPlanReport(plan: MigrationPlan): string {
  const lines = [
    pc.bold("Migration plan"),
    `Canonical: ${plan.canonicalDir}`,
    "",
    ...plan.actions.map((action) => `${action.skillName}: ${action.kind} (${action.source.agentId})`),
  ];
  if (plan.warnings.length > 0) {
    lines.push("", pc.yellow("Warnings:"));
    lines.push(...plan.warnings.map((warning) => `${warning.path}: ${warning.message}`));
  }
  return lines.join("\n");
}

export function formatApplyReport(result: ApplyResult): string {
  const lines = [
    pc.bold("Migration result"),
    `Migrated: ${result.migrated.length}`,
    `Linked: ${result.linked.length}`,
    `Already linked/canonical: ${result.already.length}`,
    `Skipped: ${result.skipped.length}`,
    `Failed: ${result.failed.length}`,
  ];
  if (result.backups.length > 0) {
    lines.push("", "Backups:");
    lines.push(...result.backups.map((backup) => `- ${backup}`));
  }
  if (result.failed.length > 0) {
    lines.push("", pc.red("Failures:"));
    lines.push(...result.failed.map((failure) => `- ${failure.action.skillName}: ${failure.error.message}`));
  }
  return lines.join("\n");
}
```

- [ ] **Step 4: Implement prompt wrappers**

Create `src/prompts.ts`:

```ts
import { confirm, isCancel } from "@clack/prompts";

export async function confirmApplyPlan(yes: boolean): Promise<boolean> {
  if (yes) {
    return true;
  }
  const answer = await confirm({
    message: "Apply this migration plan?",
    initialValue: false,
  });
  if (isCancel(answer)) {
    return false;
  }
  return Boolean(answer);
}
```

- [ ] **Step 5: Run tests**

Run: `npm test -- tests/report.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

If git is available:

```bash
git add src/report.ts src/prompts.ts tests/report.test.ts
git commit -m "feat: report migration plans and results"
```

## Task 10: CLI Orchestration

**Files:**
- Modify: `src/cli.ts`
- Create: `tests/cli.test.ts`

- [ ] **Step 1: Write failing CLI tests**

Create `tests/cli.test.ts`:

```ts
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);

async function makeSkill(root: string) {
  const dir = path.join(root, ".claude", "skills", "foo");
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, "SKILL.md"), "foo");
}

describe("cli", () => {
  it("prints a dry-run plan without writing canonical skill", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "asm-cli-"));
    await makeSkill(root);
    const cliPath = path.resolve("src/cli.ts");
    const { stdout } = await execFileAsync("node", ["--loader", "tsx/esm", cliPath, "migrate", "--dry-run"], {
      cwd: root,
      env: { ...process.env },
    });

    expect(stdout).toContain("Migration plan");
    await expect(readFile(path.join(root, ".agents", "skills", "foo", "SKILL.md"), "utf8")).rejects.toThrow();
  });

  it("applies migration with --yes", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "asm-cli-"));
    await makeSkill(root);
    const cliPath = path.resolve("src/cli.ts");
    const { stdout } = await execFileAsync("node", ["--loader", "tsx/esm", cliPath, "migrate", "--yes"], {
      cwd: root,
      env: { ...process.env },
    });

    expect(stdout).toContain("Migrated: 1");
    expect(await readFile(path.join(root, ".agents", "skills", "foo", "SKILL.md"), "utf8")).toBe("foo");
  });
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `npm test -- tests/cli.test.ts`

Expected: FAIL because `src/cli.ts` still contains placeholder behavior.

- [ ] **Step 3: Implement CLI orchestration**

Replace `src/cli.ts` with:

```ts
import os from "node:os";
import { getCanonicalDir, parseAgentId, resolveAgents } from "./agents.js";
import { applyMigrationPlan } from "./apply.js";
import { confirmApplyPlan } from "./prompts.js";
import { formatApplyReport, formatPlanReport } from "./report.js";
import { scanAgentSkills } from "./scan.js";
import { createMigrationPlan } from "./planner.js";
import type { AgentId } from "./types.js";

interface CliOptions {
  global: boolean;
  dryRun: boolean;
  yes: boolean;
  selectedAgents: AgentId[];
}

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = { global: false, dryRun: false, yes: false, selectedAgents: [] };
  for (let index = 1; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--global") {
      options.global = true;
    } else if (arg === "--dry-run") {
      options.dryRun = true;
    } else if (arg === "--yes") {
      options.yes = true;
    } else if (arg === "--agent") {
      const value = argv[index + 1];
      if (!value) {
        throw new Error("--agent requires a value");
      }
      options.selectedAgents.push(parseAgentId(value));
      index += 1;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return options;
}

function timestamp(): string {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, "0");
  return [
    now.getFullYear(),
    pad(now.getMonth() + 1),
    pad(now.getDate()),
    pad(now.getHours()),
    pad(now.getMinutes()),
    pad(now.getSeconds()),
  ].join("");
}

export async function main(argv = process.argv.slice(2)): Promise<void> {
  if (argv[0] !== "migrate") {
    console.error("Usage: agent-skills-migrator migrate [--global] [--dry-run] [--yes] [--agent <id>]");
    process.exitCode = 1;
    return;
  }

  const options = parseArgs(argv);
  const cwd = process.cwd();
  const homeDir = os.homedir();
  const canonicalDir = getCanonicalDir({ cwd, homeDir, global: options.global });
  const agents = resolveAgents({
    cwd,
    homeDir,
    env: process.env,
    global: options.global,
    selectedAgents: options.selectedAgents,
  });
  const scan = await scanAgentSkills(agents);
  const plan = await createMigrationPlan(scan, { canonicalDir, yes: options.yes });

  console.log(formatPlanReport(plan));

  if (options.dryRun) {
    return;
  }
  if (plan.actions.length === 0) {
    console.log("No skills to migrate.");
    return;
  }
  const shouldApply = await confirmApplyPlan(options.yes);
  if (!shouldApply) {
    console.log("Migration cancelled.");
    return;
  }

  const result = await applyMigrationPlan(plan, { stamp: timestamp() });
  console.log(formatApplyReport(result));
  if (result.failed.length > 0) {
    process.exitCode = 1;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
```

- [ ] **Step 4: Run CLI tests**

Run: `npm test -- tests/cli.test.ts`

Expected: PASS.

- [ ] **Step 5: Run all tests and typecheck**

Run:

```bash
npm run typecheck
npm test
npm run build
```

Expected: all commands PASS.

- [ ] **Step 6: Commit**

If git is available:

```bash
git add src/cli.ts tests/cli.test.ts
git commit -m "feat: wire migrate command"
```

## Task 11: Documentation and Final Verification

**Files:**
- Create: `README.md`
- Modify: `package.json`

- [ ] **Step 1: Write README**

Create `README.md`:

````md
# agent-skills-migrator

Migrate existing agent skills into a shared canonical directory and replace agent-specific copies with relative filesystem symlinks.

## MVP

Supported agents:

- Codex
- Claude Code
- OpenCode
- Cursor

Project canonical directory:

```text
.agents/skills
```

Global canonical directory:

```text
~/.agents/skills
```

## Usage

Preview project migration:

```bash
npx agent-skills-migrator migrate --dry-run
```

Apply project migration without prompts:

```bash
npx agent-skills-migrator migrate --yes
```

Preview global migration:

```bash
npx agent-skills-migrator migrate --global --dry-run
```

Restrict to an agent:

```bash
npx agent-skills-migrator migrate --agent claude-code --dry-run
```

## Safety

- Conflicts default to `Skip`.
- `--yes` skips conflicts and reports them.
- Source skills are backed up before being replaced with symlinks.
- Symlink creation follows the Vercel Labs filesystem symlink pattern: relative links, parent symlink awareness, same-realpath checks, and Windows junction support.
````

- [ ] **Step 2: Ensure bin wrapper is executable**

Run: `chmod +x bin/cli.mjs`

Expected: command succeeds.

- [ ] **Step 3: Run full verification**

Run:

```bash
npm run typecheck
npm test
npm run build
node dist/src/cli.js migrate --dry-run
```

Expected:

- typecheck passes
- tests pass
- build passes
- dry-run prints a migration plan or no-op message

- [ ] **Step 4: Commit**

If git is available:

```bash
git add README.md package.json bin/cli.mjs
git commit -m "docs: document agent skills migrator"
```

## Self-Review Checklist

- Spec coverage:
  - `migrate`, `--global`, `--agent`, `--yes`, and `--dry-run` are covered by CLI tasks.
  - Codex, Claude Code, OpenCode, Cursor paths are covered by agent tests.
  - Project canonical `.agents/skills` and global canonical `~/.agents/skills` are covered.
  - Multi-agent merge semantics are covered by planner tests.
  - Conflict default `Skip` is covered by `--yes` planner behavior.
  - Vercel-style relative filesystem symlink behavior is covered by symlink tests.
  - Transactional backup and rollback structure is covered by apply tests.

- Placeholder scan:
  - The plan contains no unresolved placeholder instructions.
  - Each code-creating task includes concrete file content.

- Type consistency:
  - `AgentId`, `ScannedSkill`, `PlanAction`, `MigrationPlan`, and `ApplyResult` are defined in Task 1 and reused consistently.
  - Function names match across modules and tests: `resolveAgents`, `scanAgentSkills`, `hashSkillDir`, `createMigrationPlan`, `createRelativeSymlink`, `applyMigrationPlan`, `formatPlanReport`, and `confirmApplyPlan`.
