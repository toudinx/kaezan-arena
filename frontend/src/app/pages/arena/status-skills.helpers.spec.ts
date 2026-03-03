import type { ArenaSkillState } from "../../arena/engine/arena-engine.types";
import { mapStatusSkillSlots, resolveSkillIdForHotkeyKey } from "./status-skills.helpers";

describe("status-skills.helpers", () => {
  it("maps snapshot skill cooldowns into compact hotbar slots", () => {
    const skills: ArenaSkillState[] = [
      { skillId: "exori", cooldownRemainingMs: 1200, cooldownTotalMs: 2000 },
      { skillId: "exori_min", cooldownRemainingMs: 0, cooldownTotalMs: 1200 },
      { skillId: "exori_mas", cooldownRemainingMs: 4500, cooldownTotalMs: 7000 },
      { skillId: "avalanche", cooldownRemainingMs: 0, cooldownTotalMs: 2500 }
    ];

    const slots = mapStatusSkillSlots(skills, 0, 400);
    expect(slots.map((slot) => `${slot.keyLabel}:${slot.skillId}`)).toEqual([
      "1:exori",
      "2:exori_min",
      "3:exori_mas",
      "4:avalanche"
    ]);
    expect(slots[0].cooldownRemainingMs).toBe(1200);
    expect(slots[0].cooldownFraction).toBeGreaterThan(0);
    expect(slots[1].cooldownRemainingMs).toBe(0);
    expect(slots[1].disabled).toBe(false);
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

  it("resolves hotkey mapping deterministically", () => {
    expect(resolveSkillIdForHotkeyKey("1")).toBe("exori");
    expect(resolveSkillIdForHotkeyKey("4")).toBe("avalanche");
    expect(resolveSkillIdForHotkeyKey("9")).toBeNull();
  });
});
