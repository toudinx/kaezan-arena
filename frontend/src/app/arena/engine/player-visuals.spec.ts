import { getPlayerSpriteAssetIdsForPreload, resolvePlayerSpriteSemanticId } from "./player-visuals";

describe("player-visuals", () => {
  it("maps known stable character ids to character-specific player sprites", () => {
    expect(resolvePlayerSpriteSemanticId("character:mirai", "idle")).toBe("sprite.player.lizard_m.idle");
    expect(resolvePlayerSpriteSemanticId("character:mirai", "run")).toBe("sprite.player.lizard_m.run");
    expect(resolvePlayerSpriteSemanticId("character:mirai", "hit")).toBe("sprite.player.lizard_m.hit");

    expect(resolvePlayerSpriteSemanticId("character:sylwen", "idle")).toBe("sprite.player.sylwen.1.idle");
    expect(resolvePlayerSpriteSemanticId("character:sylwen", "run")).toBe("sprite.player.sylwen.1.run");
    expect(resolvePlayerSpriteSemanticId("character:sylwen", "hit")).toBe("sprite.player.sylwen.1.hit");

    expect(resolvePlayerSpriteSemanticId("character:velvet", "idle")).toBe("sprite.player.kaelis_dawn.idle");
    expect(resolvePlayerSpriteSemanticId("character:velvet", "run")).toBe("sprite.player.kaelis_dawn.run");
    expect(resolvePlayerSpriteSemanticId("character:velvet", "hit")).toBe("sprite.player.kaelis_dawn.hit");
  });

  it("falls back to generic player sprites only when character id is missing or unknown", () => {
    expect(resolvePlayerSpriteSemanticId("", "idle")).toBe("sprite.player.idle");
    expect(resolvePlayerSpriteSemanticId("character:unknown", "run")).toBe("sprite.player.run");
  });

  it("exports preload ids for every configured player sprite asset without duplicates", () => {
    const ids = getPlayerSpriteAssetIdsForPreload();
    expect(ids).toContain("sprite.player.idle");
    expect(ids).toContain("sprite.player.lizard_m.idle");
    expect(ids).toContain("sprite.player.sylwen.1.run");
    expect(ids).toContain("sprite.player.kaelis_dawn.hit");
    expect(new Set(ids).size).toBe(ids.length);
  });
});
