import {
  COMBAT_FX_HIT_IMPACT,
  COMBAT_FX_MELEE_SWING,
  COMBAT_FX_RANGED_PROJECTILE,
  computeDirectionAngleRad,
  computeNormalizedProgress,
  interpolateLinear,
  normalizeCombatFxKind
} from "./attack-fx.helpers";

describe("attack-fx.helpers", () => {
  it("normalizes unknown combat fx kinds to hit impact", () => {
    expect(normalizeCombatFxKind(COMBAT_FX_MELEE_SWING)).toBe(COMBAT_FX_MELEE_SWING);
    expect(normalizeCombatFxKind(COMBAT_FX_RANGED_PROJECTILE)).toBe(COMBAT_FX_RANGED_PROJECTILE);
    expect(normalizeCombatFxKind(999)).toBe(COMBAT_FX_HIT_IMPACT);
  });

  it("computes normalized progress for interpolation", () => {
    expect(computeNormalizedProgress(0, 220)).toBe(0);
    expect(computeNormalizedProgress(110, 220)).toBeCloseTo(0.5, 5);
    expect(computeNormalizedProgress(280, 220)).toBe(1);
    expect(computeNormalizedProgress(100, 0)).toBe(1);
  });

  it("interpolates scalar values and direction deterministically", () => {
    const angle = computeDirectionAngleRad({ x: 1, y: 1 }, { x: 4, y: 3 });
    expect(angle).toBeCloseTo(Math.atan2(2, 3), 8);
    expect(interpolateLinear(1, 4, 0.5)).toBeCloseTo(2.5, 8);
  });
});
