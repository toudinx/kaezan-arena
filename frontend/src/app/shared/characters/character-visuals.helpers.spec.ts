import { resolveCharacterPortraitVisual } from "./character-visuals.helpers";

describe("character-visuals.helpers", () => {
  it("maps known characters to deterministic portrait sprites and tones", () => {
    const kina = resolveCharacterPortraitVisual({ characterId: "character:kina", displayName: "Kina" });
    expect(kina.tone).toBe("amber");
    expect(kina.imageUrl).toContain("knight_f_idle_anim_f0.png");
    expect(kina.homepageImageUrl).toContain("knight_f_idle_anim_f0.png");
    expect(kina.prerunImageUrl).toContain("knight_f_run_anim_f1.png");
    expect(kina.kaelisImageUrl).toContain("knight_f_idle_anim_f0.png");
    expect(kina.runImageUrl).toContain("knight_f_run_anim_f1.png");
    expect(kina.hitImageUrl).toContain("knight_f_hit_anim_f0.png");
    expect(kina.sigil).toBe("K");
    expect(kina.skinId).toBe("1");
  });

  it("maps ranged prototype id to Sylwen visuals and supports context-specific portraits", () => {
    const sylwenHome = resolveCharacterPortraitVisual({
      characterId: "character:ranged_prototype",
      displayName: "Sylwen",
      context: "homepage"
    });
    expect(sylwenHome.tone).toBe("teal");
    expect(sylwenHome.imageUrl).toContain("sylwen_homepage_1.jpg");
    expect(sylwenHome.runImageUrl).toContain("sylwen_gameplay_1_run_f1.png");
    expect(sylwenHome.hitImageUrl).toContain("sylwen_gameplay_1_hit_f0.png");
    expect(sylwenHome.sigil).toBe("S");

    const sylwenPreRun = resolveCharacterPortraitVisual({
      characterId: "character:ranged_prototype",
      displayName: "Sylwen",
      context: "prerun"
    });
    expect(sylwenPreRun.imageUrl).toContain("sylwen_prerun_1.jpg");

    const sylwenRoster = resolveCharacterPortraitVisual({
      characterId: "character:ranged_prototype",
      displayName: "Sylwen",
      context: "roster"
    });
    expect(sylwenRoster.imageUrl).toContain("sylwen_gameplay_1_idle_f0.png");
  });

  it("returns slate fallback when character id has no mapping", () => {
    const unknown = resolveCharacterPortraitVisual({ characterId: "character:unknown", displayName: "Echo Runner" });
    expect(unknown.tone).toBe("slate");
    expect(unknown.imageUrl).toBeNull();
    expect(unknown.homepageImageUrl).toBeNull();
    expect(unknown.prerunImageUrl).toBeNull();
    expect(unknown.kaelisImageUrl).toBeNull();
    expect(unknown.runImageUrl).toBeNull();
    expect(unknown.hitImageUrl).toBeNull();
    expect(unknown.skinId).toBeNull();
    expect(unknown.monogram).toBe("ER");
  });

  it("builds deterministic monogram fallback for empty names", () => {
    const unnamed = resolveCharacterPortraitVisual({ characterId: null, displayName: "   " });
    expect(unnamed.monogram).toBe("?");
  });
});
