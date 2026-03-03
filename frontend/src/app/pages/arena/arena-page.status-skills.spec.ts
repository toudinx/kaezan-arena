import { ArenaPageComponent } from "./arena-page.component";

describe("ArenaPageComponent status skills window interactions", () => {
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

  function enableCommandIssuing(component: ArenaPageComponent): void {
    (component as any).currentBattleId = "battle-status";
    (component as any).battleStatus = "started";
    (component as any).ui = {
      ...(component as any).ui,
      status: "started",
      player: {
        ...(component as any).ui.player,
        globalCooldownRemainingMs: 0
      }
    };
    (component as any).battleRequestInFlight = false;
  }

  it("clicking a status skill slot uses the same cast pipeline as its hotkey", () => {
    const component = createComponent();
    enableCommandIssuing(component);

    component.onStatusSkillActivated("exori");
    component.onKeyDown(new KeyboardEvent("keydown", { key: "1" }));

    const queued = (component as any).queuedCommands as Array<Record<string, unknown>>;
    expect(queued).toEqual([
      { type: "cast_skill", skillId: "exori" },
      { type: "cast_skill", skillId: "exori" }
    ]);
  });
});
