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

  it("targets both log consoles when focus helpers run", () => {
    const component = createComponent();
    const scrollSpy = vi.spyOn(component as any, "scrollConsoleToBottom");

    (component as any).focusDamageConsole();
    (component as any).focusLootConsole();

    expect(scrollSpy).toHaveBeenCalledWith(undefined, ".damage-console__body");
    expect(scrollSpy).toHaveBeenCalledWith(undefined, ".loot-console__body");
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

  it("opens death modal from game-over snapshot and closes only via explicit action", async () => {
    const component = createComponent();
    const beginNewRunSpy = vi.spyOn(component as any, "beginNewRun").mockResolvedValue(undefined);

    (component as any).applyGameOverStateFromSnapshot({
      isGameOver: true,
      endReason: "death",
      battleStatus: "defeat"
    });
    expect((component as any).isDeathModalOpen).toBe(true);
    expect((component as any).deathEndReason).toBe("death");

    (component as any).applyGameOverStateFromSnapshot({
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
    (component as any).deathEndReason = "death";

    component.onDeathModalReturnToPreRun();

    expect((component as any).isInRun).toBe(false);
    expect((component as any).currentBattleId).toBe("");
    expect((component as any).battleStatus).toBe("idle");
    expect((component as any).isDeathModalOpen).toBe(false);
    expect((component as any).deathEndReason).toBeNull();
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
