import { buildDropSourceKey, dedupeDropSources } from "./loot-source.helpers";

describe("loot-source.helpers", () => {
  it("builds deterministic source keys", () => {
    const key = buildDropSourceKey("battle-a", {
      tick: 12,
      sourceType: "mob",
      sourceId: "mob.001"
    });

    expect(key).toBe("battle-a:12:mob:mob.001");
  });

  it("dedupes sources against previously sent keys", () => {
    const sent = new Set<string>(["battle-a:12:mob:mob.001"]);
    const deduped = dedupeDropSources(
      "battle-a",
      [
        { tick: 12, sourceType: "mob", sourceId: "mob.001", species: "melee_brute" },
        { tick: 12, sourceType: "chest", sourceId: "chest.001", species: null },
        { tick: 12, sourceType: "chest", sourceId: "chest.001", species: null }
      ],
      sent
    );

    expect(deduped).toEqual([{ tick: 12, sourceType: "chest", sourceId: "chest.001", species: null }]);
    expect(sent.has("battle-a:12:chest:chest.001")).toBe(true);
  });
});
