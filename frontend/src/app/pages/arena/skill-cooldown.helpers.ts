export interface CooldownSkillLike {
  skillId: string;
  cooldownRemainingMs: number;
}

export function clamp01(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.min(1, value));
}

export function computeCooldownFraction(remainingMs: number, totalMs: number): number {
  const safeRemaining = Math.max(0, remainingMs);
  const safeTotal = Math.max(0, totalMs);

  if (safeTotal === 0) {
    return safeRemaining > 0 ? 1 : 0;
  }

  return clamp01(safeRemaining / safeTotal);
}

export function formatCooldownSeconds(remainingMs: number): string {
  return `${(Math.max(0, remainingMs) / 1000).toFixed(1)}s`;
}

export function isReadyButBlockedByGcd(skillRemainingMs: number, gcdRemainingMs: number): boolean {
  return Math.max(0, skillRemainingMs) === 0 && Math.max(0, gcdRemainingMs) > 0;
}

export function collectReadyPulseSkillIds(
  previousSkills: ReadonlyArray<CooldownSkillLike>,
  nextSkills: ReadonlyArray<CooldownSkillLike>
): ReadonlySet<string> {
  const previousById = new Map<string, number>();
  for (const skill of previousSkills) {
    previousById.set(skill.skillId, Math.max(0, skill.cooldownRemainingMs));
  }

  const pulseIds = new Set<string>();
  for (const skill of nextSkills) {
    const previousRemaining = previousById.get(skill.skillId) ?? 0;
    const nextRemaining = Math.max(0, skill.cooldownRemainingMs);
    if (previousRemaining > 0 && nextRemaining === 0) {
      pulseIds.add(skill.skillId);
    }
  }

  return pulseIds;
}
