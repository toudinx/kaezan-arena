import { resolveCharacterPortraitVisual } from "./character-visuals.helpers";

describe("character-visuals.helpers", () => {
  it("maps known characters to deterministic portrait sprites and tones", () => {
    const mirai = resolveCharacterPortraitVisual({ characterId: "character:mirai", displayName: "Mirai" });
    expect(mirai.tone).toBe("teal");
    expect(mirai.imageUrl).toContain("lizard_m_idle_anim_f0.png");
    expect(mirai.homepageImageUrl).toContain("lizard_m_idle_anim_f0.png");
    expect(mirai.prerunImageUrl).toContain("lizard_m_run_anim_f1.png");
    expect(mirai.kaelisImageUrl).toContain("lizard_m_idle_anim_f0.png");
    expect(mirai.runImageUrl).toContain("lizard_m_run_anim_f1.png");
    expect(mirai.hitImageUrl).toContain("lizard_m_hit_anim_f0.png");
    expect(mirai.sigil).toBe("M");
    expect(mirai.skinId).toBe("m");
  });

  it("maps Sylwen visuals and supports context-specific portraits", () => {
    const sylwenHome = resolveCharacterPortraitVisual({
      characterId: "character:sylwen",
      displayName: "Sylwen",
      context: "homepage"
    });
    expect(sylwenHome.tone).toBe("teal");
    expect(sylwenHome.imageUrl).toContain("sylwen_homepage_1.jpg");
    expect(sylwenHome.runImageUrl).toContain("sylwen_gameplay_1_run_f1.png");
    expect(sylwenHome.hitImageUrl).toContain("sylwen_gameplay_1_hit_f0.png");
    expect(sylwenHome.sigil).toBe("S");

    const sylwenPreRun = resolveCharacterPortraitVisual({
      characterId: "character:sylwen",
      displayName: "Sylwen",
      context: "prerun"
    });
    expect(sylwenPreRun.imageUrl).toContain("sylwen_prerun_1.png");

    const sylwenRoster = resolveCharacterPortraitVisual({
      characterId: "character:sylwen",
      displayName: "Sylwen",
      context: "roster"
    });
    expect(sylwenRoster.imageUrl).toContain("sylwen_gameplay_1_idle_f0.png");
  });

  it("maps Velvet visuals to the configured remapped asset set", () => {
    const velvet = resolveCharacterPortraitVisual({
      characterId: "character:velvet",
      displayName: "Velvet"
    });

    expect(velvet.imageUrl).toContain("wizzard_f_idle_anim_f0.png");
    expect(velvet.runImageUrl).toContain("wizzard_f_run_anim_f1.png");
    expect(velvet.hitImageUrl).toContain("wizzard_f_hit_anim_f0.png");
    expect(velvet.sigil).toBe("V");
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
