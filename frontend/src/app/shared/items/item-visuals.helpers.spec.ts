import { resolveItemVisual } from "./item-visuals.helpers";

describe("item-visuals.helpers", () => {
  it("maps weapon classes to deterministic glyphs and icon assets", () => {
    const sword = resolveItemVisual({ slot: "weapon", weaponClass: "sword" });
    expect(sword.iconGlyph).toBe("SW");
    expect(sword.iconImageUrl).toContain("weapon_knight_sword");
    expect(sword.tone).toBe("weapon");
  });

  it("falls back from weapon class to name keyword inference", () => {
    const inferred = resolveItemVisual({ slot: "weapon", weaponClass: "", displayName: "Bronze Hammer" });
    expect(inferred.iconGlyph).toBe("HM");
    expect(inferred.iconImageUrl).toContain("weapon_hammer");
  });

  it("returns clean non-image fallbacks for armor and relic", () => {
    expect(resolveItemVisual({ slot: "armor" })).toEqual({
      iconImageUrl: null,
      iconGlyph: "AR",
      tone: "armor"
    });
    expect(resolveItemVisual({ slot: "relic" })).toEqual({
      iconImageUrl: null,
      iconGlyph: "RL",
      tone: "relic"
    });
  });
});
