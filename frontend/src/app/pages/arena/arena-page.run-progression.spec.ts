import { ArenaPageComponent } from "./arena-page.component";

describe("ArenaPageComponent run progression", () => {
  function createComponent(overrides?: { battleApi?: unknown }): ArenaPageComponent {
    const ngZoneStub = {
      run: (action: () => void): void => action()
    };
    const cdrStub = {
      markForCheck: (): void => undefined
    };

    return new ArenaPageComponent(
      {} as never,
      {} as never,
      (overrides?.battleApi ?? {}) as never,
      {} as never,
      ngZoneStub as never,
      cdrStub as never
    );
  }

  it("updates run xp fields and exp bar from start and step snapshots", () => {
    const component = createComponent();

    (component as any).applyRunProgressFromSnapshot({
      tick: 0,
      runLevel: 1,
      runXp: 0,
      xpToNextLevel: 25
    });
    expect((component as any).runLevel).toBe(1);
    expect((component as any).runXp).toBe(0);
    expect((component as any).xpToNextLevel).toBe(25);
    expect(component.playerExpPercent).toBe(0);

    (component as any).applyRunProgressFromSnapshot({
      tick: 1,
      runLevel: 1,
      runXp: 10,
      xpToNextLevel: 25,
      events: [
        {
          type: "xp_gained",
          amount: 10,
          sourceSpeciesId: "melee_brute",
          isElite: false
        }
      ]
    });
    expect((component as any).runXp).toBe(10);
    expect(component.playerExpPercent).toBe(40);
    expect((component as any).expConsoleEntries[0]?.message).toContain("+10 XP");
    expect((component as any).expConsoleEntries[0]?.message).toContain("Melee Brute");
  });

  it("logs level-up events and keeps xp carry-over progress", () => {
    const component = createComponent();

    (component as any).applyRunProgressFromSnapshot({
      tick: 2,
      runLevel: 1,
      runXp: 20,
      xpToNextLevel: 25,
      events: []
    });

    (component as any).applyRunProgressFromSnapshot({
      tick: 3,
      runLevel: 2,
      runXp: 5,
      xpToNextLevel: 40,
      events: [
        {
          type: "xp_gained",
          amount: 10,
          sourceSpeciesId: "ranged_archer",
          isElite: false
        },
        {
          type: "level_up",
          previousLevel: 1,
          newLevel: 2,
          runXp: 5,
          xpToNextLevel: 40
        }
      ]
    });

    expect((component as any).runLevel).toBe(2);
    expect((component as any).runXp).toBe(5);
    expect((component as any).xpToNextLevel).toBe(40);
    expect(component.playerExpPercent).toBe(12.5);

    const expEntries = (component as any).expConsoleEntries as Array<{ kind: string; message: string }>;
    expect(expEntries.some((entry) => entry.kind === "level_up" && entry.message.includes("Run Lv. 2"))).toBe(true);
    expect(expEntries.some((entry) => entry.kind === "xp_gained" && entry.message.includes("+10 XP"))).toBe(true);
  });

  it("status tab rows expose run progression instead of meta progression", () => {
    const component = createComponent();
    (component as any).runLevel = 3;
    (component as any).runXp = 7;
    (component as any).xpToNextLevel = 55;

    const rows = component.statusTabRows;
    expect(rows[0]).toEqual({ label: "Run level", value: "3" });
    expect(rows[1]).toEqual({ label: "Run XP", value: "7 / 55" });
    expect(rows[2]).toEqual({ label: "XP to next", value: "55" });
  });

  it("formats HUD timer labels from snapshot run times", () => {
    const component = createComponent();

    (component as any).applyRunProgressFromSnapshot({
      tick: 4,
      runTimeMs: 94_000,
      runDurationMs: 180_000
    });

    expect(component.runHudTimerElapsedLabel).toBe("01:34");
    expect(component.runHudTimerTotalLabel).toBe("03:00");
  });

  it("freezes HUD timer at run end using runEndedAtMs (or timeSurvived fallback)", () => {
    const component = createComponent();
    (component as any).runDurationMs = 180_000;
    (component as any).runTimeMs = 120_000;
    (component as any).timeSurvivedMs = 116_000;
    (component as any).isRunEnded = true;
    (component as any).runEndedAtMs = 95_000;

    expect(component.runHudTimerElapsedLabel).toBe("01:35");

    (component as any).runEndedAtMs = null;
    (component as any).timeSurvivedMs = 94_000;
    (component as any).runTimeMs = 160_000;

    expect(component.runHudTimerElapsedLabel).toBe("01:34");
  });

  it("tracks card choice pending and selected card snapshots", () => {
    const component = createComponent();

    (component as any).applyCardChoiceStateFromSnapshot({
      isAwaitingCardChoice: true,
      pendingChoiceId: "card-choice-01",
      offeredCards: [
        { id: "colossus_heart", name: "Colossus Heart", description: "+40% max HP and +6 damage." },
        { id: "butcher_mark", name: "Butcher Mark", description: "+12 flat damage." }
      ],
      selectedCards: []
    });

    expect((component as any).isAwaitingCardChoice).toBe(true);
    expect((component as any).pendingCardChoiceId).toBe("card-choice-01");
    expect((component as any).offeredCards).toHaveLength(2);

    (component as any).applyCardChoiceStateFromSnapshot({
      isAwaitingCardChoice: false,
      pendingChoiceId: null,
      offeredCards: [],
      selectedCards: [{ id: "colossus_heart", name: "Colossus Heart", description: "+40% max HP and +6 damage." }]
    });

    expect((component as any).isAwaitingCardChoice).toBe(false);
    expect((component as any).pendingCardChoiceId).toBeNull();
    expect((component as any).offeredCards).toEqual([]);
    expect((component as any).selectedCards).toHaveLength(1);
    expect((component as any).selectedCards[0]?.id).toBe("colossus_heart");
  });

  it("logs card progression events in the EXP console", () => {
    const component = createComponent();

    (component as any).applyRunProgressFromSnapshot({
      tick: 9,
      runLevel: 2,
      runXp: 8,
      xpToNextLevel: 40,
      events: [
        {
          type: "card_choice_offered",
          choiceId: "card-choice-02",
          offeredCards: [
            { id: "colossus_heart", name: "Colossus Heart", description: "+40% max HP and +6 damage." },
            { id: "butcher_mark", name: "Butcher Mark", description: "+12 flat damage." }
          ]
        },
        {
          type: "card_chosen",
          choiceId: "card-choice-02",
          card: { id: "colossus_heart", name: "Colossus Heart", description: "+40% max HP and +6 damage." }
        }
      ]
    });

    const messages = ((component as any).expConsoleEntries as Array<{ message: string }>).map((entry) => entry.message);
    expect(messages.some((message) => message.includes("Card choice offered"))).toBe(true);
    expect(messages.some((message) => message.includes("Card chosen: Colossus Heart"))).toBe(true);
  });

  it("choosing a card clears awaiting state and restarts auto-step loop", async () => {
    const chooseCardResponse = {
      battleId: "battle-card",
      tick: 12,
      actors: [],
      skills: [],
      globalCooldownRemainingMs: 0,
      globalCooldownTotalMs: 400,
      altarCooldownRemainingMs: 0,
      seed: 1337,
      facingDirection: "up",
      battleStatus: "started",
      isGameOver: false,
      endReason: null,
      runXp: 0,
      runLevel: 1,
      xpToNextLevel: 25,
      effectiveTargetEntityId: null,
      lockedTargetEntityId: null,
      groundTargetPos: null,
      assistConfig: {
        enabled: false,
        autoHealEnabled: true,
        healAtHpPercent: 40,
        autoGuardEnabled: true,
        guardAtHpPercent: 60,
        autoOffenseEnabled: true,
        offenseMode: "cooldown_spam",
        autoSkills: { exori: true, exori_min: true, exori_mas: true, avalanche: true },
        maxAutoCastsPerTick: 1
      },
      playerBaseElement: 1,
      weaponElement: null,
      decals: [],
      activeBuffs: [],
      bestiary: [],
      pendingSpeciesChest: null,
      activePois: [],
      isAwaitingCardChoice: false,
      pendingChoiceId: null,
      offeredCards: [],
      selectedCards: [{ id: "colossus_heart", name: "Colossus Heart", description: "+40% max HP and +6 damage." }],
      events: [
        {
          type: "card_chosen",
          choiceId: "card-choice-01",
          card: { id: "colossus_heart", name: "Colossus Heart", description: "+40% max HP and +6 damage." }
        }
      ],
      commandResults: []
    };
    const chooseCardSpy = vi.fn().mockResolvedValue(chooseCardResponse);
    const component = createComponent({
      battleApi: {
        chooseCard: chooseCardSpy
      }
    });
    (component as any).scene = (component as any).engine.createTestScene();
    (component as any).currentBattleId = "battle-card";
    (component as any).battleStatus = "started";
    (component as any).isAwaitingCardChoice = true;
    (component as any).pendingCardChoiceId = "card-choice-01";
    (component as any).offeredCards = [
      { id: "colossus_heart", name: "Colossus Heart", description: "+40% max HP and +6 damage." }
    ];
    (component as any).autoStepEnabled = false;
    (component as any).autoStepWasEnabledBeforeCardChoice = true;

    const restartSpy = vi
      .spyOn(component as any, "startOrRestartAutoStepLoop")
      .mockImplementation(() => undefined);

    await (component as any).chooseCard("colossus_heart");

    expect(chooseCardSpy).toHaveBeenCalledWith({
      battleId: "battle-card",
      choiceId: "card-choice-01",
      selectedCardId: "colossus_heart"
    });
    expect((component as any).isAwaitingCardChoice).toBe(false);
    expect((component as any).pendingCardChoiceId).toBeNull();
    expect((component as any).offeredCards).toEqual([]);
    expect((component as any).selectedCards).toHaveLength(1);
    expect((component as any).cardChoiceRequestInFlight).toBe(false);
    expect((component as any).autoStepEnabled).toBe(true);
    expect(restartSpy).toHaveBeenCalledTimes(1);
  });
});
