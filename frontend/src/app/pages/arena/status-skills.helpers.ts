import type { ArenaBuffState, ArenaSkillState } from "../../arena/engine/arena-engine.types";
import {
  normalizeSkillToken,
  resolveSkillPresentation,
  type SkillVisualFamily,
  type SkillVisualTier
} from "../../shared/skills/skill-presentation.helpers";
import { computeCooldownFraction, formatCooldownSeconds, isReadyButBlockedByGcd } from "./skill-cooldown.helpers";

export type StatusSkillBinding = Readonly<{
  keyLabel: string;
  skillId: string;
}>;

// Fixed 3-slot kit bindings. Avalanche lives in the free slot (rune system).
export const STATUS_SKILL_BINDINGS: readonly StatusSkillBinding[] = [
  { keyLabel: "1", skillId: "exori" },
  { keyLabel: "2", skillId: "exori_min" },
  { keyLabel: "3", skillId: "exori_mas" }
] as const;

export type StatusSkillSlotViewModel = Readonly<{
  keyLabel: string;
  skillId: string;
  label: string;
  iconGlyph: string;
  accentColor: string;
  visualFamily: SkillVisualFamily;
  visualTier: SkillVisualTier;
  cooldownRemainingMs: number;
  cooldownTotalMs: number;
  cooldownFraction: number;
  cooldownText: string;
  tooltip: string;
  blockedByGlobalCooldown: boolean;
  disabled: boolean;
  isLocked: boolean;
  /** True for the fourth free (rune) slot - styled distinctly from the 3 fixed slots. */
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
    const presentation = resolveSkillPresentation({
      skillId: state?.skillId ?? binding.skillId,
      displayName: state?.displayName ?? null
    });

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
      label: presentation.label,
      iconGlyph: presentation.iconGlyph,
      accentColor: presentation.accentColor,
      visualFamily: presentation.family,
      visualTier: presentation.tier,
      cooldownRemainingMs: remainingMs,
      cooldownTotalMs: totalMs,
      cooldownFraction: computeCooldownFraction(remainingMs, totalMs),
      cooldownText,
      tooltip: buildSkillTooltip(presentation.label, cooldownText, isLocked, false),
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
  const fallbackLabel = freeSlotWeaponName ?? "Rune Slot";
  const freeSlotToken = normalizeSkillToken(freeSlotWeaponName);

  const state = skillStates.find((entry) => {
    const stateTokenFromId = normalizeSkillToken(entry.skillId);
    const stateTokenFromName = normalizeSkillToken(entry.displayName ?? null);
    return freeSlotToken !== null && (stateTokenFromId === freeSlotToken || stateTokenFromName === freeSlotToken);
  });

  const presentation = resolveSkillPresentation({
    skillId: state?.skillId ?? freeSlotToken,
    displayName: freeSlotWeaponName ?? state?.displayName ?? null,
    fallbackLabel
  });

  const gcdRemaining = Math.max(0, globalCooldownRemainingMs);
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
    skillId: state?.skillId ?? freeSlotWeaponName ?? "__free_slot__",
    label: presentation.label,
    iconGlyph: presentation.iconGlyph,
    accentColor: presentation.accentColor,
    visualFamily: presentation.family,
    visualTier: presentation.tier,
    cooldownRemainingMs: remainingMs,
    cooldownTotalMs: totalMs,
    cooldownFraction: computeCooldownFraction(remainingMs, totalMs),
    cooldownText,
    tooltip: buildSkillTooltip(presentation.label, cooldownText, isLocked, true),
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

function buildSkillTooltip(label: string, cooldownText: string, isLocked: boolean, isFreeSlot: boolean): string {
  if (isLocked) {
    return isFreeSlot ? "Rune slot is empty." : `${label} is currently unavailable.`;
  }

  if (cooldownText.length > 0) {
    return `${label} - ${cooldownText}`;
  }

  return `${label} - Ready`;
}
