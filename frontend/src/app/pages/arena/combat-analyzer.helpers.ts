export type CombatMetricKind =
  | "damage_dealt"
  | "damage_taken"
  | "healing"
  | "shield_gained"
  | "shield_lost";

export type CombatMetricSample = Readonly<{
  kind: CombatMetricKind;
  amount: number;
  runTimeMs: number;
}>;

export type CombatMetricTotals = Readonly<{
  damageDealt: number;
  damageTaken: number;
  healing: number;
  shieldGained: number;
  shieldLost: number;
}>;

export type CombatRollingRates = Readonly<{
  dps: number;
  dtps: number;
  hps: number;
  shieldGainPerSecond: number;
  shieldLossPerSecond: number;
}>;

export type CombatRateSeriesKind =
  | "dps"
  | "dtps"
  | "hps"
  | "shield_gain_per_second"
  | "shield_loss_per_second";

export type CombatRateSeriesPoint = Readonly<{
  index: number;
  startMs: number;
  endMs: number;
  value: number;
}>;

export type CombatRateSeries = Readonly<{
  kind: CombatRateSeriesKind;
  label: string;
  maxValue: number;
  latestValue: number;
  points: ReadonlyArray<CombatRateSeriesPoint>;
}>;

export type EliteTimelineEventKind = "spawned" | "died";

export type EliteTimelineEvent = Readonly<{
  kind: EliteTimelineEventKind;
  eliteEntityId: string;
  runTimeMs: number;
  mobType: number | null;
}>;

export type EliteEncounterSummary = Readonly<{
  encounterId: string;
  eliteEntityId: string;
  mobType: number | null;
  spawnMs: number;
  despawnMs: number | null;
  isAlive: boolean;
  uptimeMs: number;
  timeToKillMs: number | null;
}>;

export type EliteTimelineSummary = Readonly<{
  encounters: number;
  kills: number;
  activeCount: number;
  uptimeMs: number;
  uptimePercent: number;
  totalActorUptimeMs: number;
  averageTimeToKillMs: number | null;
  fastestTimeToKillMs: number | null;
  slowestTimeToKillMs: number | null;
  rows: ReadonlyArray<EliteEncounterSummary>;
}>;

const EMPTY_TOTALS: CombatMetricTotals = {
  damageDealt: 0,
  damageTaken: 0,
  healing: 0,
  shieldGained: 0,
  shieldLost: 0
};

const SERIES_DEFINITIONS: ReadonlyArray<Readonly<{ kind: CombatRateSeriesKind; label: string; source: keyof CombatMetricTotals }>> = [
  { kind: "dps", label: "DPS", source: "damageDealt" },
  { kind: "dtps", label: "DTPS", source: "damageTaken" },
  { kind: "hps", label: "HPS", source: "healing" },
  { kind: "shield_gain_per_second", label: "Shield+/s", source: "shieldGained" },
  { kind: "shield_loss_per_second", label: "Shield-/s", source: "shieldLost" }
];

export function computeCombatTotals(samples: ReadonlyArray<CombatMetricSample>): CombatMetricTotals {
  if (samples.length === 0) {
    return EMPTY_TOTALS;
  }

  const totals: MutableCombatMetricTotals = createMutableTotals();
  for (const sample of samples) {
    const amount = normalizeMetricAmount(sample.amount);
    if (amount <= 0) {
      continue;
    }

    applyMetricAmount(totals, sample.kind, amount);
  }

  return freezeTotals(totals);
}

export function computeCombatRollingTotals(
  samples: ReadonlyArray<CombatMetricSample>,
  nowMs: number,
  windowMs: number
): CombatMetricTotals {
  if (samples.length === 0) {
    return EMPTY_TOTALS;
  }

  const safeNowMs = normalizeRunTime(nowMs);
  const safeWindowMs = normalizeWindowMs(windowMs);
  const windowStartMs = Math.max(0, safeNowMs - safeWindowMs);
  const totals: MutableCombatMetricTotals = createMutableTotals();

  for (const sample of samples) {
    const sampleRunTimeMs = normalizeRunTime(sample.runTimeMs);
    if (sampleRunTimeMs < windowStartMs || sampleRunTimeMs > safeNowMs) {
      continue;
    }

    const amount = normalizeMetricAmount(sample.amount);
    if (amount <= 0) {
      continue;
    }

    applyMetricAmount(totals, sample.kind, amount);
  }

  return freezeTotals(totals);
}

export function resolveRollingWindowSeconds(nowMs: number, windowMs: number): number {
  const safeNowMs = normalizeRunTime(nowMs);
  const safeWindowMs = normalizeWindowMs(windowMs);
  const elapsedInWindowMs = Math.max(1000, Math.min(safeWindowMs, safeNowMs));
  return elapsedInWindowMs / 1000;
}

export function computeCombatRollingRates(totals: CombatMetricTotals, windowSeconds: number): CombatRollingRates {
  const safeWindowSeconds = Math.max(1, Number.isFinite(windowSeconds) ? windowSeconds : 1);
  return {
    dps: totals.damageDealt / safeWindowSeconds,
    dtps: totals.damageTaken / safeWindowSeconds,
    hps: totals.healing / safeWindowSeconds,
    shieldGainPerSecond: totals.shieldGained / safeWindowSeconds,
    shieldLossPerSecond: totals.shieldLost / safeWindowSeconds
  };
}

export function buildCombatRateSeries(
  samples: ReadonlyArray<CombatMetricSample>,
  nowMs: number,
  windowMs: number,
  bucketCount = 10
): CombatRateSeries[] {
  const safeNowMs = normalizeRunTime(nowMs);
  const safeWindowMs = normalizeWindowMs(windowMs);
  const safeBucketCount = Math.max(1, Math.floor(Number.isFinite(bucketCount) ? bucketCount : 10));
  const windowStartMs = Math.max(0, safeNowMs - safeWindowMs);
  const bucketDurationMs = Math.max(1, Math.ceil(safeWindowMs / safeBucketCount));
  const buckets: MutableCombatMetricTotals[] = [];

  for (let index = 0; index < safeBucketCount; index += 1) {
    buckets.push(createMutableTotals());
  }

  for (const sample of samples) {
    const sampleRunTimeMs = normalizeRunTime(sample.runTimeMs);
    if (sampleRunTimeMs < windowStartMs || sampleRunTimeMs > safeNowMs) {
      continue;
    }

    const amount = normalizeMetricAmount(sample.amount);
    if (amount <= 0) {
      continue;
    }

    const offsetMs = sampleRunTimeMs - windowStartMs;
    const bucketIndex = Math.min(safeBucketCount - 1, Math.max(0, Math.floor(offsetMs / bucketDurationMs)));
    applyMetricAmount(buckets[bucketIndex], sample.kind, amount);
  }

  const bucketDurationSeconds = bucketDurationMs / 1000;
  return SERIES_DEFINITIONS.map((seriesDefinition) => {
    const points: CombatRateSeriesPoint[] = [];
    let maxValue = 0;

    for (let index = 0; index < buckets.length; index += 1) {
      const startMs = windowStartMs + (index * bucketDurationMs);
      const endMs = Math.min(safeNowMs, startMs + bucketDurationMs);
      const value = buckets[index][seriesDefinition.source] / bucketDurationSeconds;
      maxValue = Math.max(maxValue, value);
      points.push({
        index,
        startMs,
        endMs,
        value
      });
    }

    return {
      kind: seriesDefinition.kind,
      label: seriesDefinition.label,
      maxValue,
      latestValue: points[points.length - 1]?.value ?? 0,
      points
    };
  });
}

export function computeEliteTimelineSummary(
  events: ReadonlyArray<EliteTimelineEvent>,
  nowMs: number
): EliteTimelineSummary {
  const safeNowMs = normalizeRunTime(nowMs);
  if (events.length === 0) {
    return {
      encounters: 0,
      kills: 0,
      activeCount: 0,
      uptimeMs: 0,
      uptimePercent: 0,
      totalActorUptimeMs: 0,
      averageTimeToKillMs: null,
      fastestTimeToKillMs: null,
      slowestTimeToKillMs: null,
      rows: []
    };
  }

  const ordered = [...events]
    .filter((event) => event.eliteEntityId.trim().length > 0)
    .map((event) => ({
      ...event,
      eliteEntityId: event.eliteEntityId.trim(),
      runTimeMs: normalizeRunTime(event.runTimeMs),
      mobType: Number.isFinite(event.mobType) ? Math.floor(event.mobType as number) : null
    }))
    .sort((left, right) => {
      const byTime = left.runTimeMs - right.runTimeMs;
      if (byTime !== 0) {
        return byTime;
      }

      if (left.kind === right.kind) {
        return 0;
      }

      return left.kind === "spawned" ? -1 : 1;
    });

  const activeByEliteId = new Map<string, number>();
  const mutableRows: MutableEliteEncounterSummary[] = [];
  for (const event of ordered) {
    const id = event.eliteEntityId;
    if (event.kind === "spawned") {
      const activeIndex = activeByEliteId.get(id);
      if (activeIndex !== undefined) {
        const activeEncounter = mutableRows[activeIndex];
        activeEncounter.despawnMs = Math.max(activeEncounter.spawnMs, event.runTimeMs);
      }

      mutableRows.push({
        encounterId: `${id}:${mutableRows.length}:${event.runTimeMs}`,
        eliteEntityId: id,
        mobType: event.mobType,
        spawnMs: event.runTimeMs,
        despawnMs: null,
        isAlive: true,
        uptimeMs: 0,
        timeToKillMs: null
      });
      activeByEliteId.set(id, mutableRows.length - 1);
      continue;
    }

    const activeIndex = activeByEliteId.get(id);
    if (activeIndex === undefined) {
      mutableRows.push({
        encounterId: `${id}:${mutableRows.length}:${event.runTimeMs}`,
        eliteEntityId: id,
        mobType: event.mobType,
        spawnMs: event.runTimeMs,
        despawnMs: event.runTimeMs,
        isAlive: false,
        uptimeMs: 0,
        timeToKillMs: 0
      });
      continue;
    }

    const activeEncounter = mutableRows[activeIndex];
    activeEncounter.despawnMs = Math.max(activeEncounter.spawnMs, event.runTimeMs);
    activeByEliteId.delete(id);
  }

  const rows = mutableRows.map((row) => {
    const effectiveEndMs = row.despawnMs === null ? safeNowMs : row.despawnMs;
    const clampedEndMs = Math.max(row.spawnMs, effectiveEndMs);
    const uptimeMs = Math.max(0, clampedEndMs - row.spawnMs);
    const timeToKillMs = row.despawnMs === null ? null : Math.max(0, row.despawnMs - row.spawnMs);
    return {
      encounterId: row.encounterId,
      eliteEntityId: row.eliteEntityId,
      mobType: row.mobType,
      spawnMs: row.spawnMs,
      despawnMs: row.despawnMs,
      isAlive: row.despawnMs === null,
      uptimeMs,
      timeToKillMs
    };
  });

  const uptimeMs = computeElitePresenceUptimeMs(rows, safeNowMs);
  const totalActorUptimeMs = rows.reduce((sum, row) => sum + row.uptimeMs, 0);
  const ttkValues = rows
    .map((row) => row.timeToKillMs)
    .filter((value): value is number => value !== null);
  const kills = ttkValues.length;
  const averageTimeToKillMs = ttkValues.length > 0 ? ttkValues.reduce((sum, value) => sum + value, 0) / ttkValues.length : null;
  const fastestTimeToKillMs = ttkValues.length > 0 ? Math.min(...ttkValues) : null;
  const slowestTimeToKillMs = ttkValues.length > 0 ? Math.max(...ttkValues) : null;

  return {
    encounters: rows.length,
    kills,
    activeCount: rows.filter((row) => row.isAlive).length,
    uptimeMs,
    uptimePercent: safeNowMs > 0 ? (uptimeMs / safeNowMs) * 100 : 0,
    totalActorUptimeMs,
    averageTimeToKillMs,
    fastestTimeToKillMs,
    slowestTimeToKillMs,
    rows
  };
}

type MutableCombatMetricTotals = {
  damageDealt: number;
  damageTaken: number;
  healing: number;
  shieldGained: number;
  shieldLost: number;
};

type MutableEliteEncounterSummary = {
  encounterId: string;
  eliteEntityId: string;
  mobType: number | null;
  spawnMs: number;
  despawnMs: number | null;
  isAlive: boolean;
  uptimeMs: number;
  timeToKillMs: number | null;
};

function createMutableTotals(): MutableCombatMetricTotals {
  return {
    damageDealt: 0,
    damageTaken: 0,
    healing: 0,
    shieldGained: 0,
    shieldLost: 0
  };
}

function freezeTotals(totals: MutableCombatMetricTotals): CombatMetricTotals {
  return {
    damageDealt: totals.damageDealt,
    damageTaken: totals.damageTaken,
    healing: totals.healing,
    shieldGained: totals.shieldGained,
    shieldLost: totals.shieldLost
  };
}

function applyMetricAmount(totals: MutableCombatMetricTotals, kind: CombatMetricKind, amount: number): void {
  if (kind === "damage_dealt") {
    totals.damageDealt += amount;
    return;
  }

  if (kind === "damage_taken") {
    totals.damageTaken += amount;
    return;
  }

  if (kind === "healing") {
    totals.healing += amount;
    return;
  }

  if (kind === "shield_gained") {
    totals.shieldGained += amount;
    return;
  }

  totals.shieldLost += amount;
}

function normalizeMetricAmount(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.floor(value));
}

function normalizeRunTime(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.floor(value));
}

function normalizeWindowMs(value: number): number {
  if (!Number.isFinite(value)) {
    return 1000;
  }

  return Math.max(1000, Math.floor(value));
}

function computeElitePresenceUptimeMs(rows: ReadonlyArray<EliteEncounterSummary>, nowMs: number): number {
  if (rows.length === 0 || nowMs <= 0) {
    return 0;
  }

  const intervals = rows
    .map((row) => {
      const start = Math.max(0, Math.min(nowMs, row.spawnMs));
      const end = Math.max(start, Math.min(nowMs, row.despawnMs ?? nowMs));
      return { start, end };
    })
    .sort((left, right) => left.start - right.start);

  if (intervals.length === 0) {
    return 0;
  }

  let mergedStart = intervals[0].start;
  let mergedEnd = intervals[0].end;
  let uptimeMs = 0;

  for (let index = 1; index < intervals.length; index += 1) {
    const interval = intervals[index];
    if (interval.start > mergedEnd) {
      uptimeMs += Math.max(0, mergedEnd - mergedStart);
      mergedStart = interval.start;
      mergedEnd = interval.end;
      continue;
    }

    mergedEnd = Math.max(mergedEnd, interval.end);
  }

  uptimeMs += Math.max(0, mergedEnd - mergedStart);
  return uptimeMs;
}
