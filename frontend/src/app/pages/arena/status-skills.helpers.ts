import type { ArenaBuffState, ArenaSkillState } from "../../arena/engine/arena-engine.types";
import { computeCooldownFraction, formatCooldownSeconds, isReadyButBlockedByGcd } from "./skill-cooldown.helpers";

export type StatusSkillBinding = Readonly<{
  keyLabel: string;
  skillId: string;
  label: string;
  accentColor: string;
}>;

export const STATUS_SKILL_BINDINGS: readonly StatusSkillBinding[] = [
  { keyLabel: "1", skillId: "exori", label: "Exori", accentColor: "#f97316" },
  { keyLabel: "2", skillId: "exori_min", label: "Exori Min", accentColor: "#ef4444" },
  { keyLabel: "3", skillId: "exori_mas", label: "Exori Mas", accentColor: "#7c3aed" },
  { keyLabel: "4", skillId: "avalanche", label: "Avalanche", accentColor: "#0ea5e9" }
] as const;

export type StatusSkillSlotViewModel = Readonly<{
  keyLabel: string;
  skillId: string;
  label: string;
  accentColor: string;
  cooldownRemainingMs: number;
  cooldownTotalMs: number;
  cooldownFraction: number;
  cooldownText: string;
  blockedByGlobalCooldown: boolean;
  disabled: boolean;
}>;

export type StatusBuffViewModel = Readonly<{
  buffId: string;
  label: string;
  remainingSeconds: number;
  isHealingAmplifier: boolean;
}>;

export function mapStatusSkillSlots(
  skillStates: ReadonlyArray<ArenaSkillState>,
  globalCooldownRemainingMs: number,
  _globalCooldownTotalMs: number,
  bindings: ReadonlyArray<StatusSkillBinding> = STATUS_SKILL_BINDINGS
): StatusSkillSlotViewModel[] {
  const byId: Record<string, ArenaSkillState> = {};
  for (const entry of skillStates) {
    byId[entry.skillId] = entry;
  }

  const gcdRemaining = Math.max(0, globalCooldownRemainingMs);

  return bindings.map((binding) => {
    const state = byId[binding.skillId];
    const remainingMs = Math.max(0, state?.cooldownRemainingMs ?? 0);
    const totalMs = Math.max(0, state?.cooldownTotalMs ?? 0);
    const blockedByGcd = isReadyButBlockedByGcd(remainingMs, gcdRemaining);
    const cooldownText = remainingMs > 0
      ? formatCooldownSeconds(remainingMs)
      : blockedByGcd
        ? `GCD ${formatCooldownSeconds(gcdRemaining)}`
        : "";

    return {
      keyLabel: binding.keyLabel,
      skillId: binding.skillId,
      label: binding.label,
      accentColor: binding.accentColor,
      cooldownRemainingMs: remainingMs,
      cooldownTotalMs: totalMs,
      cooldownFraction: computeCooldownFraction(remainingMs, totalMs),
      cooldownText,
      blockedByGlobalCooldown: blockedByGcd,
      disabled: remainingMs > 0 || blockedByGcd
    };
  });
}

export function mapStatusBuffs(activeBuffs: ReadonlyArray<ArenaBuffState>): StatusBuffViewModel[] {
  return activeBuffs
    .filter((buff) => buff.remainingMs > 0)
    .map((buff) => ({
      buffId: buff.buffId,
      label: buff.buffId
        .split("_")
        .map((segment) => segment.length > 0 ? segment[0].toUpperCase() + segment.slice(1) : segment)
        .join(" "),
      remainingSeconds: Math.max(1, Math.ceil(buff.remainingMs / 1000)),
      isHealingAmplifier: buff.buffId === "healing_amplifier"
    }))
    .sort((left, right) => left.buffId.localeCompare(right.buffId));
}

export function resolveSkillIdForHotkeyKey(
  key: string,
  bindings: ReadonlyArray<StatusSkillBinding> = STATUS_SKILL_BINDINGS
): string | null {
  const matched = bindings.find((binding) => binding.keyLabel === key);
  return matched?.skillId ?? null;
}
