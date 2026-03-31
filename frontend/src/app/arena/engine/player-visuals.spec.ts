import { getPlayerSpriteAssetIdsForPreload, resolvePlayerSpriteSemanticId } from "./player-visuals";

describe("player-visuals", () => {
  it("maps known stable character ids to character-specific player sprites", () => {
    expect(resolvePlayerSpriteSemanticId("character:kina", "idle")).toBe("sprite.player.kina.idle");
    expect(resolvePlayerSpriteSemanticId("character:kina", "run")).toBe("sprite.player.kina.run");
    expect(resolvePlayerSpriteSemanticId("character:kina", "hit")).toBe("sprite.player.kina.hit");

    expect(resolvePlayerSpriteSemanticId("character:ranged_prototype", "idle")).toBe("sprite.player.ranged_prototype.idle");
    expect(resolvePlayerSpriteSemanticId("character:ranged_prototype", "run")).toBe("sprite.player.ranged_prototype.run");
    expect(resolvePlayerSpriteSemanticId("character:ranged_prototype", "hit")).toBe("sprite.player.ranged_prototype.hit");
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
    expect(ids).toContain("sprite.player.ranged_prototype.run");
    expect(ids).toContain("sprite.player.kaelis_dawn.hit");
    expect(ids).toContain("sprite.player.kaelis_ember.hit");
    expect(new Set(ids).size).toBe(ids.length);
  });
});

