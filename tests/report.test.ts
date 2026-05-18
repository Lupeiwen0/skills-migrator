import { describe, expect, it } from "vitest";
import { formatApplyReport, formatPlanReport } from "../src/report.js";
import type { ApplyResult, MigrationPlan, PlanAction, ScannedSkill } from "../src/types.js";

function scannedSkill(name: string, agentId: ScannedSkill["agentId"] = "claude-code"): ScannedSkill {
  return {
    name,
    agentId,
    sourcePath: `/source/${name}`,
    isCanonical: false,
    isSymlink: false,
  };
}

function action(kind: PlanAction["kind"], skillName = "foo"): PlanAction {
  return {
    kind,
    skillName,
    source: scannedSkill(skillName),
    canonicalPath: `/canonical/${skillName}`,
  };
}

function plan(overrides: Partial<MigrationPlan> = {}): MigrationPlan {
  return {
    canonicalDir: "/canonical",
    actions: [],
    warnings: [],
    ...overrides,
  };
}

function applyResult(overrides: Partial<ApplyResult> = {}): ApplyResult {
  return {
    migrated: [],
    linked: [],
    skipped: [],
    already: [],
    failed: [],
    backups: [],
    connectionWarnings: [],
    ...overrides,
  };
}

describe("formatPlanReport", () => {
  it("contains action lines and canonical dir", () => {
    const report = formatPlanReport(
      plan({
        actions: [action("migrate", "foo")],
      }),
    );

    expect(report).toContain("Migration plan");
    expect(report).toContain("Canonical: /canonical");
    expect(report).toContain("foo: migrate");
  });

  it("includes warnings", () => {
    const report = formatPlanReport(
      plan({
        warnings: [{ agentId: "codex", path: "/bad/SKILL.md", message: "missing heading" }],
      }),
    );

    expect(report).toContain("Warnings:");
    expect(report).toContain("/bad/SKILL.md: missing heading");
  });
});

describe("formatApplyReport", () => {
  it("contains migrated count and recovery backups when backup exists", () => {
    const report = formatApplyReport(
      applyResult({
        migrated: [action("migrate", "foo")],
        backups: ["/canonical/.tmp/backups/20260518120000/claude-code/foo"],
      }),
    );

    expect(report).toContain("Migration result");
    expect(report).toContain("Migrated: 1");
    expect(report).toContain("Recovery backups:");
    expect(report).toContain("Original source directories were moved here");
    expect(report).toContain("/canonical/.tmp/backups/20260518120000/claude-code/foo");
  });

  it("includes failures", () => {
    const report = formatApplyReport(
      applyResult({
        failed: [{ action: action("migrate", "foo"), error: new Error("copy failed") }],
      }),
    );

    expect(report).toContain("Failures:");
    expect(report).toContain("- foo: copy failed");
  });

  it("includes connection warnings", () => {
    const report = formatApplyReport(
      applyResult({
        connectionWarnings: ["Symlink failed for foo; copied instead. Reason: EPERM"],
      }),
    );

    expect(report).toContain("Connection warnings:");
    expect(report).toContain("Symlink failed for foo; copied instead. Reason: EPERM");
  });
});
