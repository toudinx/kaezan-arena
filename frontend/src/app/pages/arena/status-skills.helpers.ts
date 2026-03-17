import type { ArenaBuffState, ArenaSkillState } from "../../arena/engine/arena-engine.types";
import { computeCooldownFraction, formatCooldownSeconds, isReadyButBlockedByGcd } from "./skill-cooldown.helpers";

export type StatusSkillBinding = Readonly<{
  keyLabel: string;
  skillId: string;
  label: string;
  accentColor: string;
}>;

// Fixed 3-slot kit bindings. Avalanche removed — it lives in the free slot (rune system).
export const STATUS_SKILL_BINDINGS: readonly StatusSkillBinding[] = [
  { keyLabel: "1", skillId: "exori", label: "Exori", accentColor: "#f97316" },
  { keyLabel: "2", skillId: "exori_min", label: "Exori Min", accentColor: "#ef4444" },
  { keyLabel: "3", skillId: "exori_mas", label: "Exori Mas", accentColor: "#7c3aed" }
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
  isLocked: boolean;
  /** True for the fourth free (rune) slot — styled distinctly from the 3 fixed slots. */
  isFreeSlot: boolean;
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
    const isLocked = state === undefined;
    const remainingMs = Math.max(0, state?.cooldownRemainingMs ?? 0);
    const totalMs = Math.max(0, state?.cooldownTotalMs ?? 0);
    const blockedByGcd = !isLocked && isReadyButBlockedByGcd(remainingMs, gcdRemaining);
    const cooldownText = remainingMs > 0
      ? formatCooldownSeconds(remainingMs)
      : blockedByGcd
        ? `GCD ${formatCooldownSeconds(gcdRemaining)}`
        : "";

    return {
      keyLabel: binding.keyLabel,
      skillId: binding.skillId,
      label: state?.displayName ?? binding.label,
      accentColor: binding.accentColor,
      cooldownRemainingMs: remainingMs,
      cooldownTotalMs: totalMs,
      cooldownFraction: computeCooldownFraction(remainingMs, totalMs),
      cooldownText,
      blockedByGlobalCooldown: blockedByGcd,
      disabled: isLocked || remainingMs > 0 || blockedByGcd,
      isLocked,
      isFreeSlot: false
    };
  });
}

/**
 * Builds the view-model for the free (rune) weapon slot.
 * When freeSlotWeaponName is null the slot is rendered as empty/locked.
 * When a rune weapon is equipped the server populates both the name and
 * a matching entry in the skills array so cooldown data flows naturally.
 */
export function buildFreeSlotViewModel(
  freeSlotWeaponName: string | null | undefined,
  skillStates: ReadonlyArray<ArenaSkillState> = [],
  globalCooldownRemainingMs = 0
): StatusSkillSlotViewModel {
  const isLocked = !freeSlotWeaponName;
  const label = freeSlotWeaponName ?? "—";
  const accentColor = "#64748b";
  const gcdRemaining = Math.max(0, globalCooldownRemainingMs);

  // When the rune system adds the free-slot skill to the snapshot, surface its cooldown.
  // For now FreeSlotWeaponId is always null so remainingMs / totalMs stay 0.
  const state = skillStates.find((s) => s.displayName === freeSlotWeaponName);
  const remainingMs = Math.max(0, state?.cooldownRemainingMs ?? 0);
  const totalMs = Math.max(0, state?.cooldownTotalMs ?? 0);
  const blockedByGcd = !isLocked && isReadyButBlockedByGcd(remainingMs, gcdRemaining);
  const cooldownText = remainingMs > 0
    ? formatCooldownSeconds(remainingMs)
    : blockedByGcd
      ? `GCD ${formatCooldownSeconds(gcdRemaining)}`
      : "";

  return {
    keyLabel: "4",
    skillId: freeSlotWeaponName ?? "__free_slot__",
    label,
    accentColor,
    cooldownRemainingMs: remainingMs,
    cooldownTotalMs: totalMs,
    cooldownFraction: computeCooldownFraction(remainingMs, totalMs),
    cooldownText,
    blockedByGlobalCooldown: blockedByGcd,
    disabled: isLocked || remainingMs > 0 || blockedByGcd,
    isLocked,
    isFreeSlot: true
  };
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
