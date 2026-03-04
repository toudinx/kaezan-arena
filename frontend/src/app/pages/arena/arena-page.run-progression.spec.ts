import { ArenaPageComponent } from "./arena-page.component";

describe("ArenaPageComponent run progression", () => {
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
});
