import { createHash } from "node:crypto";
import { readdir, readFile, realpath, stat } from "node:fs/promises";
import path from "node:path";

export interface HashResult {
  hash: string;
  safe: boolean;
  warnings: string[];
}

interface HashEntry {
  relativePath: string;
  content: Buffer;
}

export async function hashSkillDir(skillDir: string): Promise<HashResult> {
  const rootRealPath = await realpath(skillDir);
  const entries: HashEntry[] = [];
  const warnings: string[] = [];

  await collectHashEntries(skillDir, skillDir, rootRealPath, entries, warnings);
  entries.sort((a, b) => compareCodeUnits(a.relativePath, b.relativePath));

  const hash = createHash("sha256");
  for (const entry of entries) {
    const pathBytes = Buffer.from(entry.relativePath, "utf8");
    hash.update("path\0");
    hash.update(String(pathBytes.length));
    hash.update("\0");
    hash.update(pathBytes);
    hash.update("\0content\0");
    hash.update(String(entry.content.length));
    hash.update("\0");
    hash.update(entry.content);
    hash.update("\0");
  }

  return {
    hash: hash.digest("hex"),
    safe: warnings.length === 0,
    warnings,
  };
}

export async function skillsHaveSameContent(a: string, b: string): Promise<boolean> {
  const [aHash, bHash] = await Promise.all([hashSkillDir(a), hashSkillDir(b)]);
  return aHash.safe && bHash.safe && aHash.hash === bHash.hash;
}

async function collectHashEntries(
  rootDir: string,
  currentDir: string,
  rootRealPath: string,
  entries: HashEntry[],
  warnings: string[],
): Promise<void> {
  const dirEntries = await readdir(currentDir, { withFileTypes: true });
  dirEntries.sort((a, b) => compareCodeUnits(a.name, b.name));

  for (const dirEntry of dirEntries) {
    const fullPath = path.join(currentDir, dirEntry.name);
    const relativePath = toRelativeHashPath(rootDir, fullPath);

    if (shouldIgnore(relativePath, dirEntry.name, dirEntry.isDirectory())) {
      continue;
    }

    if (dirEntry.isDirectory()) {
      await collectHashEntries(rootDir, fullPath, rootRealPath, entries, warnings);
      continue;
    }

    if (dirEntry.isSymbolicLink()) {
      await collectSymlinkEntry(fullPath, relativePath, rootRealPath, entries, warnings);
      continue;
    }

    if (dirEntry.isFile()) {
      entries.push({ relativePath, content: await readFile(fullPath) });
      continue;
    }

    warnings.push(`${relativePath}: unsupported file type`);
  }
}

async function collectSymlinkEntry(
  linkPath: string,
  relativePath: string,
  rootRealPath: string,
  entries: HashEntry[],
  warnings: string[],
): Promise<void> {
  let targetRealPath: string;
  try {
    targetRealPath = await realpath(linkPath);
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      warnings.push(`${relativePath}: broken symlink`);
      return;
    }

    warnings.push(`${relativePath} is an unresolvable symlink`);
    return;
  }

  if (!isInsideRoot(rootRealPath, targetRealPath)) {
    warnings.push(`${relativePath}: symlink target is outside skill directory`);
    return;
  }

  const targetStat = await stat(targetRealPath);
  if (!targetStat.isFile()) {
    warnings.push(`${relativePath}: symlink target is not a file`);
    return;
  }

  entries.push({ relativePath, content: await readFile(targetRealPath) });
}

function shouldIgnore(relativePath: string, name: string, isDirectory: boolean): boolean {
  if (/\.backup-\d{14}(?:-[a-f0-9]{4})?$/.test(name)) {
    return true;
  }

  if (name === ".DS_Store" || name === ".git" || name === "__pycache__") {
    return true;
  }

  return isDirectory && name === ".tmp";
}

function isInsideRoot(rootRealPath: string, targetRealPath: string): boolean {
  const relative = path.relative(rootRealPath, targetRealPath);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function toRelativeHashPath(rootDir: string, fullPath: string): string {
  return path.relative(rootDir, fullPath).split(path.sep).join(path.posix.sep);
}

function compareCodeUnits(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
