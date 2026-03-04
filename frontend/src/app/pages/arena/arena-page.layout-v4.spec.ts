import { ArenaPageComponent } from "./arena-page.component";

describe("ArenaPageComponent layout v4", () => {
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

  it("targets all log consoles when focus helpers run", () => {
    const component = createComponent();
    const scrollSpy = vi.spyOn(component as any, "scrollConsoleToBottom");

    (component as any).focusDamageConsole();
    (component as any).focusLootConsole();
    (component as any).focusExpConsole();

    expect(scrollSpy).toHaveBeenCalledWith(undefined, ".combat-analyzer__body");
    expect(scrollSpy).toHaveBeenCalledWith(undefined, ".economy-analyzer__body");
    expect(scrollSpy).toHaveBeenCalledWith(undefined, ".events-feed");
  });

  it("shows pre-run mode before start, then enters run mode", async () => {
    const component = createComponent();
    vi.spyOn(component as any, "beginNewRun").mockResolvedValue(undefined);

    expect(component.isInRun).toBe(false);

    await component.startRun();

    expect(component.isInRun).toBe(true);
  });

  it("opens hotkeys modal and closes it with ESC", () => {
    const component = createComponent();

    component.openHotkeysModal();
    expect((component as any).isHotkeysModalOpen).toBe(true);

    component.onKeyDown(new KeyboardEvent("keydown", { key: "Escape" }));
    expect((component as any).isHotkeysModalOpen).toBe(false);
  });

  it("opens run complete overlay from run-ended snapshot and closes only via explicit action", async () => {
    const component = createComponent();
    const beginNewRunSpy = vi.spyOn(component as any, "beginNewRun").mockResolvedValue(undefined);

    (component as any).applyGameOverStateFromSnapshot({
      isRunEnded: true,
      runEndReason: "defeat_death",
      runEndedAtMs: 125000,
      isGameOver: true,
      endReason: "death",
      battleStatus: "defeat"
    });
    expect((component as any).isRunEnded).toBe(true);
    expect((component as any).runEndReason).toBe("defeat_death");
    expect((component as any).isDeathModalOpen).toBe(true);
    expect((component as any).deathEndReason).toBe("defeat_death");

    (component as any).applyGameOverStateFromSnapshot({
      isRunEnded: false,
      runEndReason: null,
      isGameOver: false,
      endReason: null,
      battleStatus: "started"
    });
    expect((component as any).isDeathModalOpen).toBe(true);

    await component.onDeathModalRestartRun();
    expect(beginNewRunSpy).toHaveBeenCalledTimes(1);
    expect((component as any).isDeathModalOpen).toBe(false);
  });

  it("return-to-pre-run death action exits run mode and closes modal", () => {
    const component = createComponent();
    (component as any).isInRun = true;
    (component as any).currentBattleId = "battle-01";
    (component as any).battleStatus = "defeat";
    (component as any).isDeathModalOpen = true;
    (component as any).deathEndReason = "defeat_death";
    (component as any).isRunEnded = true;
    (component as any).runEndReason = "defeat_death";

    component.onDeathModalReturnToPreRun();

    expect((component as any).isInRun).toBe(false);
    expect((component as any).currentBattleId).toBe("");
    expect((component as any).battleStatus).toBe("idle");
    expect((component as any).isDeathModalOpen).toBe(false);
    expect((component as any).deathEndReason).toBeNull();
    expect((component as any).isRunEnded).toBe(false);
    expect((component as any).runEndReason).toBeNull();
  });

  it("sets run complete state for victory snapshots", () => {
    const component = createComponent();

    (component as any).applyGameOverStateFromSnapshot({
      isRunEnded: true,
      runEndReason: "victory_time",
      runEndedAtMs: 180000,
      isGameOver: true,
      endReason: "time",
      battleStatus: "victory"
    });

    expect((component as any).isRunEnded).toBe(true);
    expect((component as any).runEndReason).toBe("victory_time");
    expect((component as any).isDeathModalOpen).toBe(true);
  });

  it("uses ESC to toggle pause modal while alive", () => {
    const component = createComponent();
    (component as any).isInRun = true;
    (component as any).currentBattleId = "battle-pause-hotkey";
    (component as any).battleStatus = "started";

    component.onKeyDown(new KeyboardEvent("keydown", { key: "Escape" }));
    expect((component as any).isPauseModalOpen).toBe(true);

    component.onKeyDown(new KeyboardEvent("keydown", { key: "Escape" }));
    expect((component as any).isPauseModalOpen).toBe(false);
  });

  it("gives death modal priority so ESC does not open pause", () => {
    const component = createComponent();
    (component as any).isInRun = true;
    (component as any).currentBattleId = "battle-death-priority";
    (component as any).battleStatus = "defeat";
    (component as any).isDeathModalOpen = true;
    (component as any).isPauseModalOpen = false;

    component.onKeyDown(new KeyboardEvent("keydown", { key: "Escape" }));

    expect((component as any).isDeathModalOpen).toBe(true);
    expect((component as any).isPauseModalOpen).toBe(false);
  });
});
