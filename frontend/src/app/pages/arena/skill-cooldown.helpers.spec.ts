import {
  collectReadyPulseSkillIds,
  computeCooldownFraction,
  formatCooldownSeconds,
  isReadyButBlockedByGcd
} from "./skill-cooldown.helpers";

describe("skill-cooldown.helpers", () => {
  it("computes cooldown fraction and formatted time from snapshot values", () => {
    expect(computeCooldownFraction(600, 1200)).toBe(0.5);
    expect(computeCooldownFraction(0, 1200)).toBe(0);
    expect(computeCooldownFraction(1200, 0)).toBe(1);
    expect(formatCooldownSeconds(1250)).toBe("1.3s");
  });

  it("flags ready skill as blocked when GCD is active", () => {
    expect(isReadyButBlockedByGcd(0, 250)).toBe(true);
    expect(isReadyButBlockedByGcd(500, 250)).toBe(false);
    expect(isReadyButBlockedByGcd(0, 0)).toBe(false);
  });

  it("detects pulse transition when cooldown reaches zero", () => {
    const previous = [
      { skillId: "exori", cooldownRemainingMs: 250 },
      { skillId: "exori_min", cooldownRemainingMs: 0 }
    ];
    const next = [
      { skillId: "exori", cooldownRemainingMs: 0 },
      { skillId: "exori_min", cooldownRemainingMs: 0 }
    ];

    const pulseIds = collectReadyPulseSkillIds(previous, next);
    expect(pulseIds.has("exori")).toBe(true);
    expect(pulseIds.has("exori_min")).toBe(false);
  });
});
