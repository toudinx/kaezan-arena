import { computeExpProgressPercent, computeUnifiedVitalsPercent } from "./arena-hud.helpers";

describe("arena-hud.helpers", () => {
  it("computes HP/Shield percentages with clamping", () => {
    expect(computeUnifiedVitalsPercent(80, 100)).toBe(80);
    expect(computeUnifiedVitalsPercent(120, 100)).toBe(100);
    expect(computeUnifiedVitalsPercent(-8, 100)).toBe(0);
    expect(computeUnifiedVitalsPercent(5, 0)).toBe(0);
  });

  it("computes deterministic EXP progress percentage", () => {
    expect(computeExpProgressPercent(6, 750)).toBeCloseTo(62.5);
    expect(computeExpProgressPercent(6, 1200)).toBe(0);
    expect(computeExpProgressPercent(6, 1500)).toBe(25);
  });
});
