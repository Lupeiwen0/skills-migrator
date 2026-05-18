import type { ApplyResult, MigrationPlan } from "./types.js";

export function formatPlanReport(plan: MigrationPlan): string {
  const lines = ["Migration plan", `Canonical: ${plan.canonicalDir}`];

  for (const action of plan.actions) {
    const reason = action.reason ? ` — ${action.reason}` : "";
    lines.push(`${action.skillName}: ${action.kind} (${action.source.agentId})${reason}`);
  }

  if (plan.warnings.length > 0) {
    lines.push("Warnings:");
    for (const warning of plan.warnings) {
      lines.push(`${warning.path}: ${warning.message}`);
    }
  }

  return lines.join("\n");
}

export function formatApplyReport(result: ApplyResult): string {
  const lines = [
    "Migration result",
    `Migrated: ${result.migrated.length}`,
    `Linked: ${result.linked.length}`,
    `Already linked/canonical: ${result.already.length}`,
    `Skipped: ${result.skipped.length}`,
    `Failed: ${result.failed.length}`,
  ];

  if (result.backups.length > 0) {
    lines.push("Recovery backups:");
    lines.push("Original source directories were moved here and can be restored manually if needed:");
    lines.push(...result.backups);
  }

  if (result.connectionWarnings.length > 0) {
    lines.push("Connection warnings:");
    lines.push(...result.connectionWarnings);
  }

  if (result.failed.length > 0) {
    lines.push("Failures:");
    for (const failure of result.failed) {
      lines.push(`- ${failure.action.skillName}: ${failure.error.message}`);
    }
  }

  return lines.join("\n");
}
