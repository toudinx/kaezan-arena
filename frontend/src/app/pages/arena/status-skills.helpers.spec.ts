import type { ArenaSkillState } from "../../arena/engine/arena-engine.types";
import { buildUltimateSlotViewModel, mapStatusSkillSlots, resolveSkillIdForHotkeyKey } from "./status-skills.helpers";

describe("status-skills.helpers", () => {
  it("maps snapshot skill cooldowns into 3 fixed hotbar slots", () => {
    const skills: ArenaSkillState[] = [
      { skillId: "exori", cooldownRemainingMs: 1200, cooldownTotalMs: 2000 },
      { skillId: "exori_min", cooldownRemainingMs: 0, cooldownTotalMs: 1200 },
      { skillId: "exori_mas", cooldownRemainingMs: 4500, cooldownTotalMs: 7000 }
    ];

    const slots = mapStatusSkillSlots(skills, 0, 400);
    expect(slots.map((slot) => `${slot.keyLabel}:${slot.skillId}`)).toEqual([
      "1:exori",
      "2:exori_min",
      "3:exori_mas"
    ]);
    expect(slots[0].cooldownRemainingMs).toBe(1200);
    expect(slots[0].cooldownFraction).toBeGreaterThan(0);
    expect(slots[1].cooldownRemainingMs).toBe(0);
    expect(slots[1].disabled).toBe(false);
    expect(slots.every((slot) => !slot.isUltimate)).toBe(true);
    expect(slots.map((slot) => slot.iconGlyph)).toEqual(["EX", "E-", "E+"]);
    expect(slots.map((slot) => slot.visualFamily)).toEqual(["exori", "exori", "exori"]);
  });

  it("marks ready skills as gcd-blocked when global cooldown is active", () => {
    const slots = mapStatusSkillSlots(
      [{ skillId: "exori", cooldownRemainingMs: 0, cooldownTotalMs: 1200 }],
      350,
      400
    );

    expect(slots[0].blockedByGlobalCooldown).toBe(true);
    expect(slots[0].disabled).toBe(true);
    expect(slots[0].cooldownText).toContain("GCD");
  });

  it("resolves hotkey mapping deterministically (no binding for slot 4)", () => {
    expect(resolveSkillIdForHotkeyKey("1")).toBe("exori");
    expect(resolveSkillIdForHotkeyKey("4")).toBeNull();
    expect(resolveSkillIdForHotkeyKey("9")).toBeNull();
  });

  it("buildUltimateSlotViewModel maps gauge progress for slot 4", () => {
    const slot = buildUltimateSlotViewModel(49, 100, false);
    expect(slot.keyLabel).toBe("4");
    expect(slot.label).toBe("ULTIMATE");
    expect(slot.isLocked).toBe(false);
    expect(slot.isUltimate).toBe(true);
    expect(slot.gaugePercent).toBe(49);
    expect(slot.ready).toBe(false);
  });

  it("buildUltimateSlotViewModel marks slot as ready when gauge is full", () => {
    const slot = buildUltimateSlotViewModel(100, 100, true);
    expect(slot.isUltimate).toBe(true);
    expect(slot.gaugePercent).toBe(100);
    expect(slot.ready).toBe(true);
    expect(slot.cooldownText).toBe("READY");
  });
});
