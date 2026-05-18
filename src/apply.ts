import { mkdir, rename, rm } from "node:fs/promises";
import path from "node:path";
import { copyDir, makeBackupPath, makeTempPath, pathExists } from "./fs-safe.js";
import { createRelativeSymlink } from "./symlink.js";
import type { ApplyResult, LinkStrategy, MigrationPlan, PlanAction } from "./types.js";

export interface ApplyOptions {
  stamp: string;
  linkStrategy?: LinkStrategy;
}

export async function applyMigrationPlan(plan: MigrationPlan, options: ApplyOptions): Promise<ApplyResult> {
  const result = emptyResult();

  for (const action of plan.actions) {
    try {
      await applyAction(action, options, result);
    } catch (error) {
      result.failed.push({ action, error: toError(error) });
    }
  }

  return result;
}

function emptyResult(): ApplyResult {
  return {
    migrated: [],
    linked: [],
    skipped: [],
    already: [],
    failed: [],
    backups: [],
    connectionWarnings: [],
  };
}

async function applyAction(action: PlanAction, options: ApplyOptions, result: ApplyResult): Promise<void> {
  switch (action.kind) {
    case "already-canonical":
    case "already-linked":
      result.already.push(action);
      return;

    case "skip":
    case "conflict":
      result.skipped.push(action);
      return;

    case "migrate":
      await migrateAction(action, options, result);
      return;

    case "link-identical":
      await replaceSourceWithConnection(action, options, result);
      result.linked.push(action);
      return;
  }
}

async function migrateAction(action: PlanAction, options: ApplyOptions, result: ApplyResult): Promise<void> {
  await mkdir(path.dirname(action.canonicalPath), { recursive: true });

  const tempPath = makeTempPath(path.dirname(action.canonicalPath), action.skillName, options.stamp);
  await rm(tempPath, { recursive: true, force: true });
  await mkdir(path.dirname(tempPath), { recursive: true });
  await copyDir(action.source.sourcePath, tempPath);

  if (!(await pathExists(path.join(tempPath, "SKILL.md")))) {
    await rm(tempPath, { recursive: true, force: true });
    throw new Error(`Temporary skill copy is missing SKILL.md: ${tempPath}`);
  }

  await rename(tempPath, action.canonicalPath);
  try {
    await replaceSourceWithConnection(action, options, result);
  } catch (error) {
    await rm(action.canonicalPath, { recursive: true, force: true });
    throw error;
  }
  result.migrated.push(action);
}

async function replaceSourceWithConnection(action: PlanAction, options: ApplyOptions, result: ApplyResult): Promise<void> {
  const sourcePath = action.source.sourcePath;
  const backupPath = makeBackupPath(sourcePath, options.stamp);
  const recoveryPath = makeRecoveryBackupPath(action, options.stamp);
  const hasExistingSource = await pathExists(sourcePath);

  if (hasExistingSource) {
    await rename(sourcePath, backupPath);
  }

  try {
    const warning = await createConnection(action, sourcePath, options.linkStrategy ?? "symlink-copy-fallback");
    if (warning !== undefined) {
      result.connectionWarnings.push(warning);
    }
  } catch (error) {
    await rm(sourcePath, { recursive: true, force: true });
    if (hasExistingSource) {
      await rename(backupPath, sourcePath);
    }
    throw error;
  }

  if (hasExistingSource) {
    await mkdir(path.dirname(recoveryPath), { recursive: true });
    await rm(recoveryPath, { recursive: true, force: true });
    await rename(backupPath, recoveryPath);
    result.backups.push(recoveryPath);
  }
}

async function createConnection(
  action: PlanAction,
  sourcePath: string,
  linkStrategy: LinkStrategy,
): Promise<string | undefined> {
  if (linkStrategy === "copy") {
    await copyDir(action.canonicalPath, sourcePath);
    return undefined;
  }

  try {
    await createRelativeSymlink(action.canonicalPath, sourcePath);
    return undefined;
  } catch (error) {
    if (linkStrategy !== "symlink-copy-fallback") {
      throw error;
    }
    await rm(sourcePath, { recursive: true, force: true });
    await copyDir(action.canonicalPath, sourcePath);
    const message = error instanceof Error ? error.message : String(error);
    return `Symlink failed for ${action.skillName}; copied instead. Reason: ${message}`;
  }
}

function makeRecoveryBackupPath(action: PlanAction, stamp: string): string {
  const canonicalDir = path.dirname(action.canonicalPath);
  return path.join(
    path.dirname(canonicalDir),
    ".tmp",
    "backups",
    stamp,
    action.source.agentId,
    action.skillName,
  );
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}
