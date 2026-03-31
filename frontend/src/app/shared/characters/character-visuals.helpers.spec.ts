import { resolveCharacterPortraitVisual } from "./character-visuals.helpers";

describe("character-visuals.helpers", () => {
  it("maps known characters to deterministic portrait sprites and tones", () => {
    const kina = resolveCharacterPortraitVisual({ characterId: "character:kina", displayName: "Kina" });
    expect(kina.tone).toBe("amber");
    expect(kina.imageUrl).toContain("knight_f_idle_anim_f0.png");
    expect(kina.runImageUrl).toContain("knight_f_run_anim_f1.png");
    expect(kina.hitImageUrl).toContain("knight_f_hit_anim_f0.png");
    expect(kina.sigil).toBe("K");
  });

  it("returns slate fallback when character id has no mapping", () => {
    const unknown = resolveCharacterPortraitVisual({ characterId: "character:unknown", displayName: "Echo Runner" });
    expect(unknown.tone).toBe("slate");
    expect(unknown.imageUrl).toBeNull();
    expect(unknown.runImageUrl).toBeNull();
    expect(unknown.hitImageUrl).toBeNull();
    expect(unknown.monogram).toBe("ER");
  });

  it("builds deterministic monogram fallback for empty names", () => {
    const unnamed = resolveCharacterPortraitVisual({ characterId: null, displayName: "   " });
    expect(unnamed.monogram).toBe("?");
  });
});
