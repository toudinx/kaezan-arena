import type { ArenaBuffState, ArenaSkillState } from "../../arena/engine/arena-engine.types";
import {
  resolveSkillPresentation,
  type SkillVisualFamily,
  type SkillVisualTier
} from "../../shared/skills/skill-presentation.helpers";
import { computeCooldownFraction, formatCooldownSeconds, isReadyButBlockedByGcd } from "./skill-cooldown.helpers";

export type StatusSkillBinding = Readonly<{
  keyLabel: string;
  skillId: string;
}>;

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
  /** True only for the fourth Ultimate slot. */
  isUltimate: boolean;
  gaugePercent: number;
  ready: boolean;
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
  _globalCooldownTotalMs: number
): StatusSkillSlotViewModel[] {
  const bindings = buildStatusSkillBindings(skillStates);
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
    const isReady = !isLocked && remainingMs <= 0 && !blockedByGcd;
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
      tooltip: buildSkillTooltip(presentation.label, presentation.description, cooldownText, isLocked, false),
      blockedByGlobalCooldown: blockedByGcd,
      disabled: isLocked || remainingMs > 0 || blockedByGcd,
      isLocked,
      isUltimate: false,
      gaugePercent: 0,
      ready: isReady
    };
  });
}

export function buildUltimateSlotViewModel(
  gauge: number,
  gaugeMax: number,
  ready: boolean
): StatusSkillSlotViewModel {
  const safeGaugeMax = Math.max(1, Math.round(gaugeMax));
  const safeGauge = Math.max(0, Math.min(Math.round(gauge), safeGaugeMax));
  const gaugePercent = Math.round((safeGauge / safeGaugeMax) * 100);
  const cooldownText = ready ? "READY" : `${gaugePercent}%`;
  const tooltip = buildSkillTooltip("ULTIMATE", "", cooldownText, false, true, ready, gaugePercent);

  return {
    keyLabel: "4",
    skillId: "skill:ultimate",
    label: "ULTIMATE",
    iconGlyph: "UT",
    accentColor: "#f59e0b",
    visualFamily: "support",
    visualTier: "heavy",
    cooldownRemainingMs: 0,
    cooldownTotalMs: 0,
    cooldownFraction: 0,
    cooldownText,
    tooltip,
    blockedByGlobalCooldown: false,
    disabled: false,
    isLocked: false,
    isUltimate: true,
    gaugePercent,
    ready
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
  skillStates: ReadonlyArray<ArenaSkillState>
): string | null {
  const bindings = buildStatusSkillBindings(skillStates);
  const matched = bindings.find((binding) => binding.keyLabel === key);
  return matched?.skillId ?? null;
}

function buildStatusSkillBindings(skillStates: ReadonlyArray<ArenaSkillState>): StatusSkillBinding[] {
  const bindings: StatusSkillBinding[] = [];

  for (let index = 0; index < skillStates.length && index < 3; index += 1) {
    bindings.push({
      keyLabel: String(index + 1),
      skillId: skillStates[index]?.skillId ?? ""
    });
  }

  return bindings.filter((binding) => binding.skillId.length > 0);
}

function buildSkillTooltip(
  label: string,
  description: string,
  cooldownText: string,
  isLocked: boolean,
  isUltimate: boolean,
  ready = false,
  gaugePercent = 0
): string {
  if (isLocked) {
    return `${label} is currently unavailable.`;
  }

  if (isUltimate) {
    if (ready) {
      return "Ultimate is charged and will fire automatically.";
    }
    return `Ultimate charge: ${gaugePercent}%`;
  }

  const normalizedDescription = description.trim();
  if (cooldownText.length > 0) {
    return normalizedDescription.length > 0
      ? `${label} - ${normalizedDescription} (${cooldownText})`
      : `${label} - ${cooldownText}`;
  }

  if (normalizedDescription.length > 0) {
    return `${label} - ${normalizedDescription}`;
  }

  return `${label} - Ready`;
}
