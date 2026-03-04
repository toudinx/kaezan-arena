import { computeExpProgressPercent, computeUnifiedVitalsPercent, formatRunTimer } from "./arena-hud.helpers";

describe("arena-hud.helpers", () => {
  it("computes HP/Shield percentages with clamping", () => {
    expect(computeUnifiedVitalsPercent(80, 100)).toBe(80);
    expect(computeUnifiedVitalsPercent(120, 100)).toBe(100);
    expect(computeUnifiedVitalsPercent(-8, 100)).toBe(0);
    expect(computeUnifiedVitalsPercent(5, 0)).toBe(0);
  });

  it("computes deterministic run EXP progress percentage", () => {
    expect(computeExpProgressPercent(15, 25)).toBe(60);
    expect(computeExpProgressPercent(25, 25)).toBe(100);
    expect(computeExpProgressPercent(40, 25)).toBe(100);
    expect(computeExpProgressPercent(-10, 25)).toBe(0);
    expect(computeExpProgressPercent(5, 0)).toBe(100);
  });

  it("formats run timer as mm:ss", () => {
    expect(formatRunTimer(0)).toBe("00:00");
    expect(formatRunTimer(94_000)).toBe("01:34");
    expect(formatRunTimer(180_000)).toBe("03:00");
    expect(formatRunTimer(-1)).toBe("00:00");
  });
});
