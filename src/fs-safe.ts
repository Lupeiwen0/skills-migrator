import { cp, lstat } from "node:fs/promises";
import path from "node:path";

export async function pathExists(filePath: string): Promise<boolean> {
  return (await safeLstat(filePath)) !== undefined;
}

export async function safeLstat(filePath: string) {
  try {
    return await lstat(filePath);
  } catch (error) {
    if (error instanceof Error && "code" in error && (error.code === "ENOENT" || error.code === "ENOTDIR")) {
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
  await cp(source, dest, { recursive: true, errorOnExist: true, force: false, verbatimSymlinks: true });
}
