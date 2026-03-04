export function computeUnifiedVitalsPercent(current: number, max: number): number {
  if (max <= 0) {
    return 0;
  }

  return clampPercent((current / max) * 100);
}

export function computeExpProgressPercent(runXp: number, xpToNextLevel: number): number {
  const safeXpToNextLevel = Math.max(1, Math.floor(xpToNextLevel));
  const safeRunXp = Math.max(0, Math.min(safeXpToNextLevel, Math.floor(runXp)));
  return clampPercent((safeRunXp / safeXpToNextLevel) * 100);
}

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.min(100, Math.max(0, value));
}
