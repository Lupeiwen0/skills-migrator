import { lstat, mkdir, readlink, realpath, rm, symlink } from "node:fs/promises";
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

function resolveSymlinkTarget(linkPath: string, linkTarget: string): string {
  return path.resolve(path.dirname(linkPath), linkTarget);
}

async function resolveParentSymlinks(filePath: string): Promise<string> {
  const resolved = path.resolve(filePath);
  const parent = path.dirname(resolved);
  const base = path.basename(resolved);
  const realParent = await safeRealpath(parent);
  return realParent === undefined ? resolved : path.join(realParent, base);
}

export async function createRelativeSymlink(target: string, linkPath: string): Promise<SymlinkResult> {
  const resolvedTarget = path.resolve(target);
  const resolvedLinkPath = path.resolve(linkPath);
  const targetRealpath = (await safeRealpath(resolvedTarget)) ?? resolvedTarget;
  const existingRealpath = (await safeRealpath(resolvedLinkPath)) ?? resolvedLinkPath;

  if (existingRealpath === targetRealpath) {
    return { status: "same-realpath" };
  }

  const targetWithResolvedParents = await resolveParentSymlinks(target);
  const linkWithResolvedParents = await resolveParentSymlinks(linkPath);
  if (targetWithResolvedParents === linkWithResolvedParents) {
    return { status: "same-realpath" };
  }

  try {
    const existingStat = await lstat(linkPath);
    if (existingStat.isSymbolicLink()) {
      const symlinkTarget = await readlink(linkPath);
      if (resolveSymlinkTarget(linkPath, symlinkTarget) === resolvedTarget) {
        return { status: "already-linked" };
      }
      await rm(linkPath);
    } else {
      await rm(linkPath, { recursive: true });
    }
  } catch (error) {
    if (!(error instanceof Error) || !("code" in error)) {
      throw error;
    }
    if (error.code === "ENOENT") {
      // Link path doesn't exist yet — fall through to creation.
    } else if (error.code === "ELOOP") {
      await rm(linkPath, { force: true }).catch(() => undefined);
    } else {
      throw error;
    }
  }

  const linkParent = path.dirname(linkPath);
  await mkdir(linkParent, { recursive: true });

  const realLinkDir = await resolveParentSymlinks(linkParent);
  const relativeTarget = path.relative(realLinkDir, target);
  const isWindows = os.platform() === "win32";
  // Junctions on Windows store an absolute path. Node resolves a relative
  // target against CWD, not the link's parent, so we resolve it ourselves.
  const symlinkTarget = isWindows ? path.resolve(realLinkDir, relativeTarget) : relativeTarget;

  await symlink(symlinkTarget, linkPath, isWindows ? "junction" : undefined);

  return { status: "created" };
}
