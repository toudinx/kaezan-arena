import {
  normalizeSkillToken,
  resolveKitBadgeForSkills,
  resolveSkillPresentation
} from "./skill-presentation.helpers";

describe("skill-presentation.helpers", () => {
  it("normalizes canonical skill references from ids, weapon ids, and names", () => {
    expect(normalizeSkillToken("weapon:exori_min")).toBe("exori_min");
    expect(normalizeSkillToken("Exori Mas")).toBe("exori_mas");
    expect(normalizeSkillToken("  void-ricochet ")).toBe("void_ricochet");
  });

  it("resolves Exori family presentation metadata consistently", () => {
    const min = resolveSkillPresentation({ skillId: "exori_min", displayName: "Exori Min" });
    const base = resolveSkillPresentation({ skillId: "weapon:exori", displayName: "Exori" });
    const mas = resolveSkillPresentation({ displayName: "Exori Mas" });

    expect(min.family).toBe("exori");
    expect(base.family).toBe("exori");
    expect(mas.family).toBe("exori");
    expect(min.tier).toBe("min");
    expect(base.tier).toBe("base");
    expect(mas.tier).toBe("mas");
  });

  it("builds deterministic fallback metadata for unknown skills", () => {
    const unknown = resolveSkillPresentation({ skillId: "mystery_blast", displayName: "Mystery Blast" });
    expect(unknown.family).toBe("unknown");
    expect(unknown.iconGlyph).toBe("MB");
    expect(unknown.label).toBe("Mystery Blast");
  });

  it("derives kit badge from resolved skill families", () => {
    expect(resolveKitBadgeForSkills([{ skillId: "exori" }, { skillId: "exori_mas" }])).toBe("melee");
    expect(resolveKitBadgeForSkills([{ displayName: "Sigil Bolt" }, { skillId: "void_ricochet" }])).toBe("ranged");
    expect(resolveKitBadgeForSkills([{ skillId: "unknown_skill" }])).toBe("unknown");
  });
});
