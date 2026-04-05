import { getPlayerSpriteAssetIdsForPreload, resolvePlayerSpriteSemanticId } from "./player-visuals";

describe("player-visuals", () => {
  it("maps known stable character ids to character-specific player sprites", () => {
    expect(resolvePlayerSpriteSemanticId("character:kina", "idle")).toBe("sprite.player.kina.idle");
    expect(resolvePlayerSpriteSemanticId("character:kina", "run")).toBe("sprite.player.kina.run");
    expect(resolvePlayerSpriteSemanticId("character:kina", "hit")).toBe("sprite.player.kina.hit");

    expect(resolvePlayerSpriteSemanticId("character:ranged_prototype", "idle")).toBe("sprite.player.sylwen.1.idle");
    expect(resolvePlayerSpriteSemanticId("character:ranged_prototype", "run")).toBe("sprite.player.sylwen.1.run");
    expect(resolvePlayerSpriteSemanticId("character:ranged_prototype", "hit")).toBe("sprite.player.sylwen.1.hit");
    expect(resolvePlayerSpriteSemanticId("character:sylwen", "run")).toBe("sprite.player.sylwen.1.run");
    expect(resolvePlayerSpriteSemanticId("character:lizard", "idle")).toBe("sprite.player.lizard_m.idle");
    expect(resolvePlayerSpriteSemanticId("character:lizard", "run")).toBe("sprite.player.lizard_m.run");
    expect(resolvePlayerSpriteSemanticId("character:lizard", "hit")).toBe("sprite.player.lizard_m.hit");
  });

  it("maps legacy character ids to dedicated fallback-compatible skins", () => {
    expect(resolvePlayerSpriteSemanticId("kaelis_01", "idle")).toBe("sprite.player.kaelis_dawn.idle");
    expect(resolvePlayerSpriteSemanticId("kaelis_02", "run")).toBe("sprite.player.kaelis_ember.run");
  });

  it("falls back to generic player sprites only when character id is missing or unknown", () => {
    expect(resolvePlayerSpriteSemanticId("", "idle")).toBe("sprite.player.idle");
    expect(resolvePlayerSpriteSemanticId("character:unknown", "run")).toBe("sprite.player.run");
  });

  it("exports preload ids for every configured player sprite asset without duplicates", () => {
    const ids = getPlayerSpriteAssetIdsForPreload();
    expect(ids).toContain("sprite.player.idle");
    expect(ids).toContain("sprite.player.kina.idle");
    expect(ids).toContain("sprite.player.sylwen.1.run");
    expect(ids).toContain("sprite.player.lizard_m.run");
    expect(ids).toContain("sprite.player.lizard_f.hit");
    expect(ids).toContain("sprite.player.kaelis_dawn.hit");
    expect(ids).toContain("sprite.player.kaelis_ember.hit");
    expect(new Set(ids).size).toBe(ids.length);
  });
});
