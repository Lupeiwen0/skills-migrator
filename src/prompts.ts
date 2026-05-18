import { confirm, isCancel, multiselect, select } from "@clack/prompts";
import { AGENTS } from "./agents.js";
import type { AgentId, LinkStrategy } from "./types.js";

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

export async function selectTargetAgents(yes: boolean): Promise<AgentId[]> {
  const allAgentIds = AGENTS.map((agent) => agent.id);

  if (yes) {
    return allAgentIds;
  }

  const answer = await multiselect<AgentId>({
    message: "Select target agent platforms",
    options: AGENTS.map((agent) => ({ value: agent.id, label: agent.label })),
    initialValues: [],
    required: true,
  });

  if (isCancel(answer)) {
    return [];
  }

  return answer;
}

export async function selectLinkStrategy(yes: boolean): Promise<LinkStrategy | undefined> {
  if (yes) {
    return "symlink-copy-fallback";
  }

  const answer = await select<LinkStrategy>({
    message: "Choose connection method",
    initialValue: "symlink-copy-fallback",
    options: [
      {
        value: "symlink-copy-fallback",
        label: "Symlink, fallback to copy",
        hint: "Recommended",
      },
      { value: "symlink", label: "Symlink only" },
      { value: "copy", label: "Copy" },
    ],
  });

  if (isCancel(answer)) {
    return undefined;
  }

  return answer;
}
