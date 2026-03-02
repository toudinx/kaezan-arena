import { ArenaPageComponent } from "./arena-page.component";

describe("ArenaPageComponent skill snapshot mapping", () => {
  function createComponent(): ArenaPageComponent {
    return new ArenaPageComponent(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never
    );
  }

  it("maps heal, guard and avalanche cooldowns from snapshot skills", () => {
    const component = createComponent();
    const mapped = (component as any).toEngineSkills([
      { skillId: "heal", cooldownRemainingMs: 3250, cooldownTotalMs: 7000 },
      { skillId: "guard", cooldownRemainingMs: 9750, cooldownTotalMs: 10000 },
      { skillId: "avalanche", cooldownRemainingMs: 1800, cooldownTotalMs: 2500 },
      { skillId: "exori", cooldownRemainingMs: 0, cooldownTotalMs: 1200 }
    ]);

    expect(mapped).toEqual([
      { skillId: "heal", cooldownRemainingMs: 3250, cooldownTotalMs: 7000 },
      { skillId: "guard", cooldownRemainingMs: 9750, cooldownTotalMs: 10000 },
      { skillId: "avalanche", cooldownRemainingMs: 1800, cooldownTotalMs: 2500 },
      { skillId: "exori", cooldownRemainingMs: 0, cooldownTotalMs: 1200 }
    ]);

    (component as any).updateVisibleSkills(mapped);
    expect(component.getCooldownRemainingMs("avalanche")).toBe(1800);
    expect(component.getCooldownTotalMs("avalanche")).toBe(2500);
    expect(component.getSkillCooldownFraction("avalanche")).toBeGreaterThan(0);
  });

  it("maps assist config from snapshot into UI state", () => {
    const component = createComponent();
    (component as any).applyAssistConfigFromSnapshot({
      assistConfig: {
        enabled: true,
        autoHealEnabled: true,
        healAtHpPercent: 35,
        autoGuardEnabled: true,
        guardAtHpPercent: 55,
        autoOffenseEnabled: true,
        offenseMode: "cooldown_spam",
        autoSkills: {
          exori: true,
          exori_min: false,
          exori_mas: true,
          avalanche: false
        },
        maxAutoCastsPerTick: 1
      }
    });

    expect((component as any).assistConfig).toEqual({
      enabled: true,
      autoHealEnabled: true,
      healAtHpPercent: 35,
      autoGuardEnabled: true,
      guardAtHpPercent: 55,
      autoOffenseEnabled: true,
      offenseMode: "cooldown_spam",
      autoSkills: {
        exori: true,
        exori_min: false,
        exori_mas: true,
        avalanche: false
      },
      maxAutoCastsPerTick: 1
    });
  });

  it("debounces assist panel changes into set_assist_config commands", async () => {
    const component = createComponent();
    (component as any).currentBattleId = "battle-assist";
    (component as any).battleStatus = "started";
    (component as any).battleRequestInFlight = false;

    component.onAssistEnabledChange({ target: { checked: true } } as unknown as Event);
    expect((component as any).queuedCommands.length).toBe(0);

    await new Promise<void>((resolve) => {
      setTimeout(() => {
        const queued = (component as any).queuedCommands as Array<Record<string, unknown>>;
        expect(queued.length).toBe(1);
        expect(queued[0]["type"]).toBe("set_assist_config");
        expect((queued[0]["assistConfig"] as Record<string, unknown>)["enabled"]).toBe(true);
        resolve();
      }, 230);
    });
  });
});
