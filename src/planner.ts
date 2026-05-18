import { realpath } from "node:fs/promises";
import path from "node:path";
import { pathExists } from "./fs-safe.js";
import { hashSkillDir, skillsHaveSameContent } from "./hash.js";
import type { MigrationPlan, PlanAction, PlanActionKind, ScanResult, ScannedSkill } from "./types.js";

export interface CreateMigrationPlanOptions {
  canonicalDir: string;
  yes: boolean;
}

export async function createMigrationPlan(
  scan: ScanResult,
  options: CreateMigrationPlanOptions,
): Promise<MigrationPlan> {
  const actions: PlanAction[] = [];
  const skillsByName = groupSkillsByName(scan.skills);

  for (const skillName of sortedNames(skillsByName)) {
    const canonicalPath = path.join(options.canonicalDir, skillName);
    const sources = sortSources(skillsByName.get(skillName) ?? []);
    let canonicalExists = await pathExists(canonicalPath);
    let canonicalIsValid = !canonicalExists || (await isSafeSkillDirectory(canonicalPath));
    let canonicalContentPath = canonicalExists && canonicalIsValid ? canonicalPath : undefined;

    for (const source of sources) {
      if (source.isCanonical) {
        actions.push(createAction("already-canonical", skillName, source, canonicalPath));
        canonicalExists = true;
        canonicalIsValid = true;
        canonicalContentPath = source.sourcePath;
        continue;
      }

      if (await isAlreadyLinked(source, canonicalPath)) {
        actions.push(createAction("already-linked", skillName, source, canonicalPath));
        canonicalExists = true;
        canonicalContentPath ??= canonicalPath;
        continue;
      }

      if (!canonicalExists) {
        actions.push(createAction("migrate", skillName, source, canonicalPath));
        canonicalExists = true;
        canonicalIsValid = true;
        canonicalContentPath = source.sourcePath;
        continue;
      }

      if (!canonicalIsValid) {
        actions.push(createConflictAction(skillName, source, canonicalPath, options.yes, "invalid canonical conflict"));
        continue;
      }

      if (source.desiredTarget) {
        actions.push(createAction("link-identical", skillName, source, canonicalPath));
        continue;
      }

      if (source.isSymlink) {
        actions.push(createConflictAction(skillName, source, canonicalPath, options.yes, "same-name symlink conflict"));
        continue;
      }

      if (canonicalContentPath && (await skillsHaveSameContent(source.sourcePath, canonicalContentPath))) {
        actions.push(createAction("link-identical", skillName, source, canonicalPath));
        continue;
      }

      actions.push(createConflictAction(skillName, source, canonicalPath, options.yes, "same-name content conflict"));
    }
  }

  return {
    canonicalDir: options.canonicalDir,
    actions,
    warnings: scan.warnings,
  };
}

async function isSafeSkillDirectory(skillDir: string): Promise<boolean> {
  try {
    return (await hashSkillDir(skillDir)).safe;
  } catch {
    return false;
  }
}

function groupSkillsByName(skills: ScannedSkill[]): Map<string, ScannedSkill[]> {
  const skillsByName = new Map<string, ScannedSkill[]>();

  for (const skill of skills) {
    const groupedSkills = skillsByName.get(skill.name) ?? [];
    groupedSkills.push(skill);
    skillsByName.set(skill.name, groupedSkills);
  }

  return skillsByName;
}

function sortedNames(skillsByName: Map<string, ScannedSkill[]>): string[] {
  return [...skillsByName.keys()].sort(compareCodeUnits);
}

function sortSources(sources: ScannedSkill[]): ScannedSkill[] {
  return [...sources].sort((a, b) => {
    if (a.isCanonical !== b.isCanonical) {
      return a.isCanonical ? -1 : 1;
    }

    const agentOrder = compareCodeUnits(a.agentId, b.agentId);
    if (agentOrder !== 0) {
      return agentOrder;
    }

    return compareCodeUnits(a.sourcePath, b.sourcePath);
  });
}

async function isAlreadyLinked(source: ScannedSkill, canonicalPath: string): Promise<boolean> {
  if (!source.isSymlink) {
    return false;
  }

  try {
    const sourceRealPath = source.realPath ?? (await realpath(source.sourcePath));
    return sourceRealPath === (await realpath(canonicalPath));
  } catch {
    return false;
  }
}

function createAction(
  kind: PlanActionKind,
  skillName: string,
  source: ScannedSkill,
  canonicalPath: string,
  reason?: string,
): PlanAction {
  return { kind, skillName, source, canonicalPath, reason };
}

function createConflictAction(
  skillName: string,
  source: ScannedSkill,
  canonicalPath: string,
  yes: boolean,
  reason: string,
): PlanAction {
  return createAction(yes ? "skip" : "conflict", skillName, source, canonicalPath, reason);
}

function compareCodeUnits(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
