import type { DamageNumberInstance } from "../../arena/engine/arena-engine.types";
import {
  formatDamageTickLabel,
  groupDamageConsoleEntriesByTick,
  mapDamageNumbersToConsoleEntries,
  mergeDamageConsoleEntries,
  resolveDamageConsoleLineClass,
  shouldAutoScrollDamageConsole
} from "./damage-console.helpers";

describe("damage-console.helpers", () => {
  function createDamageEvent(overrides: Partial<DamageNumberInstance>): DamageNumberInstance {
    return {
      actorId: "player.demo",
      amount: 10,
      isCrit: false,
      kind: "damage",
      isHeal: false,
      isShieldChange: false,
      isDamageReceived: true,
      sourceEntityId: "mob.archer.1",
      targetEntityId: "player.demo",
      element: 6,
      tilePos: { x: 3, y: 3 },
      stackIndex: 0,
      spawnOrder: 0,
      elapsedMs: 0,
      durationMs: 950,
      ...overrides
    };
  }

  it("maps events in deterministic spawn order using compact messages", () => {
    const entries = mapDamageNumbersToConsoleEntries(
      [
        createDamageEvent({ spawnOrder: 2, sourceEntityId: "mob.brute.2", amount: 8, isDamageReceived: true }),
        createDamageEvent({
          spawnOrder: 0,
          kind: "heal",
          isHeal: true,
          isShieldChange: false,
          isDamageReceived: false,
          sourceEntityId: "player.demo",
          targetEntityId: "player.demo",
          amount: 14
        }),
        createDamageEvent({
          spawnOrder: 1,
          isShieldChange: true,
          shieldChangeDirection: "gain",
          amount: 5,
          sourceEntityId: "player.demo",
          targetEntityId: "player.demo"
        })
      ],
      120
    );

    expect(entries.map((entry) => entry.kind)).toEqual(["heal", "shield", "incoming"]);
    expect(entries.map((entry) => entry.message)).toEqual([
      "+14 HP",
      "+5 SH",
      "-8 from Brute"
    ]);
  });

  it("groups console entries by consecutive tick and formats tick label", () => {
    const entries = [
      ...mapDamageNumbersToConsoleEntries([createDamageEvent({ spawnOrder: 0, amount: 2 })], 128),
      ...mapDamageNumbersToConsoleEntries([createDamageEvent({ spawnOrder: 1, amount: 3 })], 128),
      ...mapDamageNumbersToConsoleEntries([createDamageEvent({ spawnOrder: 0, amount: 4 })], 129)
    ];

    const groups = groupDamageConsoleEntriesByTick(entries);
    expect(groups.map((group) => [formatDamageTickLabel(group.tick), group.entries.length])).toEqual([
      ["[t=128]", 2],
      ["[t=129]", 1]
    ]);
  });

  it("assigns class by line kind", () => {
    expect(resolveDamageConsoleLineClass("incoming")).toBe("damage-console__line--incoming");
    expect(resolveDamageConsoleLineClass("outgoing")).toBe("damage-console__line--outgoing");
    expect(resolveDamageConsoleLineClass("heal")).toBe("damage-console__line--heal");
    expect(resolveDamageConsoleLineClass("shield")).toBe("damage-console__line--shield");
    expect(resolveDamageConsoleLineClass("reflect")).toBe("damage-console__line--reflect");
  });

  it("merges entries without duplicates and keeps max size", () => {
    const first = mapDamageNumbersToConsoleEntries([createDamageEvent({ spawnOrder: 0 })], 10);
    const second = [
      ...mapDamageNumbersToConsoleEntries([createDamageEvent({ spawnOrder: 0 })], 10),
      ...mapDamageNumbersToConsoleEntries([createDamageEvent({ spawnOrder: 1, sourceEntityId: "mob.2", amount: 22 })], 11)
    ];

    const merged = mergeDamageConsoleEntries(first, second, 2);
    expect(merged.length).toBe(2);
    expect(merged[0].tick).toBe(10);
    expect(merged[1].tick).toBe(11);
  });

  it("autoscroll helper only sticks when near bottom", () => {
    expect(shouldAutoScrollDamageConsole(300, 200, 520)).toBe(true);
    expect(shouldAutoScrollDamageConsole(200, 200, 520)).toBe(false);
  });
});
