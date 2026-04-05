import { getMobArchetypeAccentColor, resolveMobSpriteSemanticId } from "./mob-visuals";

describe("mob-visuals", () => {
  it("maps mob archetype to distinct sprite semantic ids", () => {
    expect(resolveMobSpriteSemanticId(1, "idle")).toBe("sprite.mob.brute.idle");
    expect(resolveMobSpriteSemanticId(2, "run")).toBe("sprite.mob.archer.run");
    expect(resolveMobSpriteSemanticId(3, "hit")).toBe("sprite.mob.demon.hit");
    expect(resolveMobSpriteSemanticId(4, "idle")).toBe("sprite.mob.shaman.idle");
  });

  it("falls back to slime sprite set when archetype is missing", () => {
    expect(resolveMobSpriteSemanticId(undefined, "idle")).toBe("sprite.mob.slime.idle");
    expect(resolveMobSpriteSemanticId(99, "run")).toBe("sprite.mob.slime.run");
  });

  it("returns stable accent colors by archetype", () => {
    expect(getMobArchetypeAccentColor(1)).toBe("#d97706");
    expect(getMobArchetypeAccentColor(2)).toBe("#22d3ee");
    expect(getMobArchetypeAccentColor(3)).toBe("#ef4444");
    expect(getMobArchetypeAccentColor(4)).toBe("#a855f7");
    expect(getMobArchetypeAccentColor(undefined)).toBe("#334155");
  });
});
