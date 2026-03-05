import {
  buildCombatRateSeries,
  computeCombatRollingRates,
  computeCombatRollingTotals,
  computeCombatTotals,
  computeEliteTimelineSummary,
  resolveRollingWindowSeconds,
  type CombatMetricSample,
  type EliteTimelineEvent
} from "./combat-analyzer.helpers";

describe("combat-analyzer.helpers", () => {
  it("computes cumulative totals across all combat metric kinds", () => {
    const samples: CombatMetricSample[] = [
      { kind: "damage_dealt", amount: 120, runTimeMs: 1000 },
      { kind: "damage_taken", amount: 45, runTimeMs: 1500 },
      { kind: "healing", amount: 30, runTimeMs: 1800 },
      { kind: "shield_gained", amount: 20, runTimeMs: 2000 },
      { kind: "shield_lost", amount: 12, runTimeMs: 2200 }
    ];

    expect(computeCombatTotals(samples)).toEqual({
      damageDealt: 120,
      damageTaken: 45,
      healing: 30,
      shieldGained: 20,
      shieldLost: 12
    });
  });

  it("computes rolling totals and rates inside the configured window", () => {
    const samples: CombatMetricSample[] = [
      { kind: "damage_dealt", amount: 50, runTimeMs: 2_000 },
      { kind: "damage_dealt", amount: 70, runTimeMs: 9_000 },
      { kind: "damage_taken", amount: 30, runTimeMs: 9_300 },
      { kind: "healing", amount: 25, runTimeMs: 9_500 },
      { kind: "shield_gained", amount: 18, runTimeMs: 9_700 },
      { kind: "shield_lost", amount: 9, runTimeMs: 9_800 }
    ];

    const rollingTotals = computeCombatRollingTotals(samples, 10_000, 5_000);
    const windowSeconds = resolveRollingWindowSeconds(10_000, 5_000);
    const rollingRates = computeCombatRollingRates(rollingTotals, windowSeconds);

    expect(rollingTotals).toEqual({
      damageDealt: 70,
      damageTaken: 30,
      healing: 25,
      shieldGained: 18,
      shieldLost: 9
    });
    expect(rollingRates).toEqual({
      dps: 14,
      dtps: 6,
      hps: 5,
      shieldGainPerSecond: 3.6,
      shieldLossPerSecond: 1.8
    });
  });

  it("builds fixed-size rolling rate series for graph rendering", () => {
    const samples: CombatMetricSample[] = [
      { kind: "damage_dealt", amount: 10, runTimeMs: 1_000 },
      { kind: "damage_dealt", amount: 20, runTimeMs: 3_000 },
      { kind: "damage_dealt", amount: 30, runTimeMs: 5_000 },
      { kind: "healing", amount: 8, runTimeMs: 4_500 }
    ];

    const series = buildCombatRateSeries(samples, 6_000, 6_000, 6);
    const dpsSeries = series.find((entry) => entry.kind === "dps");
    const hpsSeries = series.find((entry) => entry.kind === "hps");

    expect(series.length).toBe(5);
    expect(dpsSeries?.points.length).toBe(6);
    expect(dpsSeries?.latestValue).toBe(30);
    expect(dpsSeries?.maxValue).toBe(30);
    expect(hpsSeries?.latestValue).toBe(0);
    expect(hpsSeries?.maxValue).toBe(8);
  });

  it("computes elite uptime and TTK including concurrent encounters", () => {
    const eliteEvents: EliteTimelineEvent[] = [
      { kind: "spawned", eliteEntityId: "elite.a", runTimeMs: 1_000, mobType: 1 },
      { kind: "spawned", eliteEntityId: "elite.b", runTimeMs: 4_000, mobType: 2 },
      { kind: "died", eliteEntityId: "elite.a", runTimeMs: 7_000, mobType: 1 },
      { kind: "died", eliteEntityId: "elite.b", runTimeMs: 12_000, mobType: 2 },
      { kind: "spawned", eliteEntityId: "elite.c", runTimeMs: 13_000, mobType: 3 }
    ];

    const summary = computeEliteTimelineSummary(eliteEvents, 15_000);

    expect(summary.encounters).toBe(3);
    expect(summary.kills).toBe(2);
    expect(summary.activeCount).toBe(1);
    expect(summary.uptimeMs).toBe(13_000);
    expect(summary.totalActorUptimeMs).toBe(16_000);
    expect(summary.averageTimeToKillMs).toBe(7_000);
    expect(summary.fastestTimeToKillMs).toBe(6_000);
    expect(summary.slowestTimeToKillMs).toBe(8_000);
    expect(summary.rows.map((row) => row.eliteEntityId)).toEqual(["elite.a", "elite.b", "elite.c"]);
    expect(summary.rows[2]?.isAlive).toBe(true);
    expect(summary.rows[2]?.timeToKillMs).toBeNull();
  });
});
