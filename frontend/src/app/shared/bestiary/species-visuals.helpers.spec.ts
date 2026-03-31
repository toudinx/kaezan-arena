import { resolveSpeciesVisual } from "./species-visuals.helpers";

describe("species-visuals.helpers", () => {
  it("maps known species ids to deterministic portrait sprites and tones", () => {
    const brute = resolveSpeciesVisual({ speciesId: "melee_brute", displayName: "Melee Brute" });
    expect(brute.tone).toBe("amber");
    expect(brute.imageUrl).toContain("ogre_idle_anim_f0.png");
    expect(brute.runImageUrl).toContain("ogre_run_anim_f1.png");
    expect(brute.hitImageUrl).toBeNull();
    expect(brute.sigil).toBe("BR");
  });

  it("returns a fallback visual for unknown species ids", () => {
    const unknown = resolveSpeciesVisual({ speciesId: "unknown_species", displayName: "Unknown Species" });
    expect(unknown.tone).toBe("slate");
    expect(unknown.imageUrl).toBeNull();
    expect(unknown.runImageUrl).toBeNull();
    expect(unknown.hitImageUrl).toBeNull();
    expect(unknown.sigil).toBe("??");
    expect(unknown.monogram).toBe("US");
  });

  it("uses a safe fallback monogram when display name is empty", () => {
    const unnamed = resolveSpeciesVisual({ speciesId: "melee_brute", displayName: "   " });
    expect(unnamed.monogram).toBe("?");
  });
});
