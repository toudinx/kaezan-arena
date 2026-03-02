import { computeDecalFadeAlpha, normalizeDecalKind, resolveDecalSemanticId } from "./decal.helpers";

describe("decal.helpers", () => {
  it("maps decal kind deterministically", () => {
    expect(normalizeDecalKind(1)).toBe(1);
    expect(normalizeDecalKind(999)).toBe(1);
  });

  it("resolves corpse semantic id from mob and player metadata", () => {
    expect(resolveDecalSemanticId("mob", 2, undefined)).toBe("sprite.mob.archer.hit");
    expect(resolveDecalSemanticId("player", undefined, undefined)).toBe("sprite.player.hit");
    expect(resolveDecalSemanticId("mob", 1, "custom.sprite")).toBe("custom.sprite");
  });

  it("clamps decal fade alpha from remaining/total ratio", () => {
    expect(computeDecalFadeAlpha(1200, 1200)).toBeCloseTo(1, 8);
    expect(computeDecalFadeAlpha(0, 1200)).toBeCloseTo(0.15, 8);
    expect(computeDecalFadeAlpha(2000, 1200)).toBeCloseTo(1, 8);
    expect(computeDecalFadeAlpha(-100, 1200)).toBeCloseTo(0.15, 8);
  });
});
