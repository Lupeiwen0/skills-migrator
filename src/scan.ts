import { readdir, realpath, stat } from "node:fs/promises";
import path from "node:path";
import { pathExists, safeLstat } from "./fs-safe.js";
import type { ResolvedAgent, ScanResult, ScanWarning, ScannedSkill } from "./types.js";

export async function scanAgentSkills(agents: ResolvedAgent[]): Promise<ScanResult> {
  const skills: ScannedSkill[] = [];
  const warnings: ScanWarning[] = [];

  for (const agent of agents) {
    if (!(await pathExists(agent.skillsDir))) {
      continue;
    }

    const skillsDirTarget = await getDirectoryTarget(agent.skillsDir);
    if (!skillsDirTarget.isResolved) {
      warnings.push({
        agentId: agent.id,
        path: agent.skillsDir,
        message: skillsDirTarget.message,
      });
      continue;
    }

    if (!skillsDirTarget.isDirectory) {
      warnings.push({
        agentId: agent.id,
        path: agent.skillsDir,
        message: "skills path is not a directory",
      });
      continue;
    }

    const entryNames = (await readdir(agent.skillsDir)).sort();

    for (const entryName of entryNames) {
      const sourcePath = path.join(agent.skillsDir, entryName);
      const lstat = await safeLstat(sourcePath);

      if (!lstat) {
        continue;
      }

      if (lstat.isSymbolicLink()) {
        const target = await getSymlinkDirectoryTarget(sourcePath);

        if (!target.isResolved) {
          warnings.push({
            agentId: agent.id,
            path: sourcePath,
            message: target.message,
          });
          continue;
        }

        if (!target.isDirectory || !(await pathExists(path.join(sourcePath, "SKILL.md")))) {
          continue;
        }

        skills.push({
          name: entryName,
          agentId: agent.id,
          sourcePath,
          isCanonical: agent.isCanonical,
          isSymlink: true,
          realPath: target.realPath,
        });
        continue;
      }

      if (!lstat.isDirectory() || !(await pathExists(path.join(sourcePath, "SKILL.md")))) {
        continue;
      }

      skills.push({
        name: entryName,
        agentId: agent.id,
        sourcePath,
        isCanonical: agent.isCanonical,
        isSymlink: false,
      });
    }
  }

  return { skills, warnings };
}

async function getDirectoryTarget(
  filePath: string,
): Promise<{ isResolved: false; message: "unresolvable symlink" } | { isResolved: true; isDirectory: boolean }> {
  const lstat = await safeLstat(filePath);

  if (!lstat) {
    return { isResolved: true, isDirectory: false };
  }

  if (lstat.isDirectory()) {
    return { isResolved: true, isDirectory: true };
  }

  if (!lstat.isSymbolicLink()) {
    return { isResolved: true, isDirectory: false };
  }

  try {
    return { isResolved: true, isDirectory: (await stat(filePath)).isDirectory() };
  } catch (error) {
    if (isMissingPathError(error)) {
      return { isResolved: true, isDirectory: false };
    }

    if (isUnresolvableSymlinkError(error)) {
      return { isResolved: false, message: "unresolvable symlink" };
    }

    throw error;
  }
}

async function getSymlinkDirectoryTarget(
  filePath: string,
): Promise<
  | { isResolved: false; message: "broken symlink" | "unresolvable symlink" }
  | { isResolved: true; isDirectory: boolean; realPath: string }
> {
  try {
    const resolvedPath = await realpath(filePath);
    const resolvedStat = await stat(resolvedPath);

    return { isResolved: true, isDirectory: resolvedStat.isDirectory(), realPath: resolvedPath };
  } catch (error) {
    if (isMissingPathError(error)) {
      return { isResolved: false, message: "broken symlink" };
    }

    if (isUnresolvableSymlinkError(error)) {
      return { isResolved: false, message: "unresolvable symlink" };
    }

    throw error;
  }
}

function isMissingPathError(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

function isUnresolvableSymlinkError(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ELOOP";
}
