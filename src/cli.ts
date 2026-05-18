import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { AGENTS, getCanonicalDir, parseAgentId, resolveAgents } from "./agents.js";
import { applyMigrationPlan } from "./apply.js";
import { createMigrationPlan } from "./planner.js";
import { confirmApplyPlan, selectLinkStrategy, selectTargetAgents } from "./prompts.js";
import { formatApplyReport, formatPlanReport } from "./report.js";
import { scanAgentSkills } from "./scan.js";
import type { AgentId, ResolvedAgent, ScanResult, ScannedSkill } from "./types.js";

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
      if (value === undefined) {
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
  const selectedAgents =
    options.selectedAgents.length > 0 ? options.selectedAgents : await selectTargetAgents(options.yes);

  if (selectedAgents.length === 0) {
    console.log("Migration cancelled.");
    return;
  }

  const agents = resolveAgents({
    cwd,
    homeDir,
    env: process.env,
    global: options.global,
    selectedAgents,
  });
  const scan = addDesiredAgentTargets(
    await scanAgentSkills(withCanonicalScanAgents(agents, { cwd, homeDir, global: options.global })),
    agents,
  );
  const plan = await createMigrationPlan(scan, { canonicalDir, yes: options.yes });

  console.log(formatPlanReport(plan));

  if (options.dryRun) {
    return;
  }

  if (plan.actions.length === 0) {
    console.log("No skills to migrate.");
    return;
  }

  const linkStrategy = await selectLinkStrategy(options.yes);
  if (linkStrategy === undefined) {
    console.log("Migration cancelled.");
    return;
  }

  const shouldApply = await confirmApplyPlan(options.yes);
  if (!shouldApply) {
    console.log("Migration cancelled.");
    return;
  }

  const result = await applyMigrationPlan(plan, { stamp: timestamp(), linkStrategy });
  console.log(formatApplyReport(result));
  if (result.failed.length > 0) {
    process.exitCode = 1;
  }
}

function withCanonicalScanAgents(
  agents: ResolvedAgent[],
  options: { cwd: string; homeDir: string; global: boolean },
): ResolvedAgent[] {
  const canonicalAgents = resolveAgents({
    cwd: options.cwd,
    homeDir: options.homeDir,
    env: process.env,
    global: options.global,
    selectedAgents: AGENTS.filter((agent) => (options.global ? false : agent.projectCanonical)).map((agent) => agent.id),
  });
  const byKey = new Map<string, ResolvedAgent>();

  for (const agent of [...canonicalAgents, ...agents]) {
    byKey.set(`${agent.id}:${agent.skillsDir}`, agent);
  }

  return [...byKey.values()];
}

function addDesiredAgentTargets(scan: ScanResult, agents: ResolvedAgent[]): ScanResult {
  const canonicalSkills = scan.skills.filter((skill) => skill.isCanonical);
  const existingKeys = new Set(scan.skills.map((skill) => `${skill.agentId}:${skill.name}`));
  const desiredSkills: ScannedSkill[] = [];

  for (const agent of agents.filter((candidate) => !candidate.isCanonical)) {
    for (const skill of canonicalSkills) {
      const key = `${agent.id}:${skill.name}`;
      if (existingKeys.has(key)) {
        continue;
      }
      desiredSkills.push({
        name: skill.name,
        agentId: agent.id,
        sourcePath: path.join(agent.skillsDir, skill.name),
        isCanonical: false,
        isSymlink: false,
        desiredTarget: true,
      });
      existingKeys.add(key);
    }
  }

  return { ...scan, skills: [...scan.skills, ...desiredSkills] };
}

if (fileURLToPath(import.meta.url) === path.resolve(process.argv[1] ?? "")) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
