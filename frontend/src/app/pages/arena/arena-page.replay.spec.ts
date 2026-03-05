import { ArenaPageComponent } from "./arena-page.component";

describe("ArenaPageComponent replay recording", () => {
  function createComponent(): ArenaPageComponent {
    const ngZoneStub = {
      run: (action: () => void): void => action()
    };
    const cdrStub = {
      markForCheck: (): void => undefined
    };

    return new ArenaPageComponent(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      ngZoneStub as never,
      cdrStub as never
    );
  }

  it("records sent command batches with tick index", () => {
    const component = createComponent();
    (component as any).currentBattleId = "run-001";
    (component as any).currentSeed = 1337;
    (component as any).selectedCharacterId = "char.replay";

    (component as any).configureRunRecordingMode(null);
    (component as any).appendStepBatchToRecording(8, [
      { type: "set_facing", dir: "left" },
      { type: "cast_skill", skillId: "exori_min" }
    ]);

    expect(component.lastRunRecording).not.toBeNull();
    expect(component.lastRunRecording?.runId).toBe("run-001");
    expect(component.lastRunRecording?.battleSeed).toBe(1337);
    expect(component.lastRunRecording?.awardedDropEventIds).toEqual([]);
    expect(component.lastRunRecording?.commandBatches).toEqual([
      {
        tick: 8,
        commands: [
          { type: "set_facing", dir: "left" },
          { type: "cast_skill", skillId: "exori_min" }
        ]
      }
    ]);
  });

  it("replayLastRun starts a run with the recorded seed and script", async () => {
    const component = createComponent();
    const recording = {
      runId: "run-2026",
      battleSeed: 2026,
      playerId: "char.replay",
      commandBatches: [{ tick: 0, commands: [{ type: "set_facing", dir: "up" }] }],
      cardChoices: [],
      awardedDropEventIds: []
    };

    component.lastRunRecording = recording as never;
    component.bootPhase = "ready_to_start";

    const beginSpy = vi
      .spyOn(component as any, "beginNewRun")
      .mockResolvedValue(undefined);

    await component.replayLastRun();

    expect(beginSpy).toHaveBeenCalledTimes(1);
    expect(beginSpy).toHaveBeenCalledWith({
      seedOverride: 2026,
      replayRecording: {
        runId: "run-2026",
        battleSeed: 2026,
        playerId: "char.replay",
        commandBatches: [{ tick: 0, commands: [{ type: "set_facing", dir: "up" }] }],
        cardChoices: [],
        awardedDropEventIds: []
      }
    });
    expect(((beginSpy.mock.calls[0] as any[])[0] as any).replayRecording).not.toBe(recording);
    expect(component.isInRun).toBe(true);
  });
});
