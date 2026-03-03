export function computeUnifiedVitalsPercent(current: number, max: number): number {
  if (max <= 0) {
    return 0;
  }

  return clampPercent((current / max) * 100);
}

export function computeExpProgressPercent(level: number, xpTotal: number): number {
  const safeLevel = Math.max(1, Math.floor(level));
  const safeXpTotal = Math.max(0, Math.floor(xpTotal));
  const levelBandXp = Math.max(100, safeLevel * 200);
  const progressXp = safeXpTotal % levelBandXp;
  return clampPercent((progressXp / levelBandXp) * 100);
}

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.min(100, Math.max(0, value));
}
