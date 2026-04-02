import type { DropEvent, ItemDefinition } from "../../api/account-api.service";
import {
  formatLootConsoleLineText,
  groupDropEventsToLootConsoleLines,
  lootItemRarityClass,
  shouldAutoScrollConsole
} from "./loot-console.helpers";

describe("loot-console.helpers", () => {
  function createDropEvent(overrides: Partial<DropEvent>): DropEvent {
    return {
      dropEventId: "drop-default",
      accountId: "acc-1",
      characterId: "char-1",
      battleId: "battle-1",
      tick: 100,
      sourceType: "mob",
      sourceId: "mob.1",
      itemId: "scrap_iron",
      quantity: 1,
      equipmentInstanceId: null,
      rewardKind: "item",
      species: null,
      awardedAtUtc: "2026-03-02T12:00:00.000Z",
      ...overrides
    };
  }

  it("groups by battle/tick/source and aggregates quantities per item", () => {
    const itemCatalogById: Record<string, ItemDefinition> = {
      scrap_iron: { itemId: "scrap_iron", displayName: "Scrap Iron", kind: "material", stackable: true, rarity: "common" },
      ember_core: { itemId: "ember_core", displayName: "Ember Core", kind: "material", stackable: true, rarity: "rare" }
    };
    const lines = groupDropEventsToLootConsoleLines(
      [
        createDropEvent({ dropEventId: "d1", tick: 106, sourceId: "mob.100", itemId: "scrap_iron", quantity: 1 }),
        createDropEvent({ dropEventId: "d2", tick: 106, sourceId: "mob.100", itemId: "scrap_iron", quantity: 1 }),
        createDropEvent({ dropEventId: "d3", tick: 106, sourceId: "mob.100", itemId: "ember_core", quantity: 1 }),
        createDropEvent({ dropEventId: "d4", tick: 107, sourceId: "mob.200", itemId: "unknown_item", quantity: 3 })
      ],
      itemCatalogById
    );

    expect(lines.length).toBe(2);
    expect(lines[0].tick).toBe(106);
    expect(lines[0].items).toMatchObject([
      { itemId: "ember_core", displayName: "Ember Core", quantity: 1, rarity: "rare", rewardKind: "item", isInventoryItem: true },
      { itemId: "scrap_iron", displayName: "Scrap Iron", quantity: 2, rarity: "common", rewardKind: "item", isInventoryItem: true }
    ]);
    expect(lines[1].items).toMatchObject([
      { itemId: "unknown_item", displayName: "unknown_item", quantity: 3, rarity: "other", rewardKind: "item", isInventoryItem: true }
    ]);
  });

  it("keeps deterministic group ordering and item ordering", () => {
    const itemCatalogById: Record<string, ItemDefinition> = {
      a_item: { itemId: "a_item", displayName: "Amber", kind: "material", stackable: true, rarity: "common" },
      b_item: { itemId: "b_item", displayName: "Blaze", kind: "material", stackable: true, rarity: "common" }
    };

    const lines = groupDropEventsToLootConsoleLines(
      [
        createDropEvent({
          dropEventId: "n3",
          battleId: "battle-b",
          tick: 20,
          sourceType: "chest",
          sourceId: "chest.2",
          itemId: "b_item",
          awardedAtUtc: "2026-03-02T12:00:05.000Z"
        }),
        createDropEvent({
          dropEventId: "n1",
          battleId: "battle-a",
          tick: 10,
          sourceType: "mob",
          sourceId: "mob.1",
          itemId: "b_item",
          awardedAtUtc: "2026-03-02T12:00:01.000Z"
        }),
        createDropEvent({
          dropEventId: "n2",
          battleId: "battle-a",
          tick: 10,
          sourceType: "mob",
          sourceId: "mob.1",
          itemId: "a_item",
          awardedAtUtc: "2026-03-02T12:00:01.200Z"
        })
      ],
      itemCatalogById
    );

    expect(lines.map((line) => `${line.battleId}:${line.tick}:${line.sourceType}:${line.sourceId}`)).toEqual([
      "battle-a:10:mob:mob.1",
      "battle-b:20:chest:chest.2"
    ]);
    expect(lines[0].items.map((item) => item.itemId)).toEqual(["a_item", "b_item"]);
  });

  it("formats line text and rarity class", () => {
    const lines = groupDropEventsToLootConsoleLines(
      [createDropEvent({ tick: 106, sourceType: "mob", itemId: "ember_core", quantity: 2 })],
      {
        ember_core: { itemId: "ember_core", displayName: "Ember Core", kind: "material", stackable: true, rarity: "epic" }
      }
    );

    expect(formatLootConsoleLineText(lines[0])).toBe("Loot (mob@106): 2x Ember Core");
    expect(lootItemRarityClass(lines[0].items[0])).toBe("loot-console__item-link--epic");
  });

  it("maps ascendant rarity to dedicated highlight class", () => {
    const lines = groupDropEventsToLootConsoleLines(
      [createDropEvent({ tick: 201, sourceType: "mob", itemId: "wpn.ascendant_forged_blade", quantity: 1 })],
      {
        "wpn.ascendant_forged_blade": {
          itemId: "wpn.ascendant_forged_blade",
          displayName: "Ascendant Forged Blade",
          kind: "equipment",
          stackable: false,
          rarity: "ascendant"
        }
      }
    );

    expect(lines).toHaveLength(1);
    expect(lootItemRarityClass(lines[0].items[0])).toBe("loot-console__item-link--ascendant");
  });

  it("renders echo fragments and primal core with additive labels", () => {
    const lines = groupDropEventsToLootConsoleLines(
      [
        createDropEvent({
          dropEventId: "e1",
          tick: 111,
          sourceId: "mob.444",
          itemId: "currency.echo_fragments",
          quantity: 1,
          rewardKind: "echo_fragments",
          species: "melee_brute"
        }),
        createDropEvent({
          dropEventId: "e2",
          tick: 111,
          sourceId: "mob.444",
          itemId: "primal_core.melee_brute",
          quantity: 1,
          rewardKind: "primal_core",
          species: "melee_brute"
        })
      ],
      {}
    );

    expect(lines).toHaveLength(1);
    expect(lines[0].items.map((item) => item.displayName)).toEqual([
      "Echo Fragments",
      "Primal Core (Melee Brute)"
    ]);
    expect(lines[0].items.every((item) => item.isInventoryItem === false)).toBe(true);
    expect(formatLootConsoleLineText(lines[0])).toBe("Loot (mob@111): +1 Echo Fragments, +1 Primal Core (Melee Brute)");
  });

  it("renders sigil drops with level and slot metadata", () => {
    const lines = groupDropEventsToLootConsoleLines(
      [
        createDropEvent({
          dropEventId: "s1",
          tick: 112,
          sourceId: "mob.445",
          itemId: "sigil_abc123",
          quantity: 1,
          rewardKind: "sigil",
          species: "melee_brute",
          sigilLevel: 7,
          slotIndex: 1
        })
      ],
      {}
    );

    expect(lines).toHaveLength(1);
    expect(lines[0].items[0].displayName).toBe("Sigil - Melee Brute Lv.7 (Slot 1)");
    expect(lootItemRarityClass(lines[0].items[0])).toBe("loot-console__item-link--sigil");
    expect(formatLootConsoleLineText(lines[0])).toBe("Loot (mob@112): +1 Sigil - Melee Brute Lv.7 (Slot 1)");
  });

  it("autoscroll helper only sticks when near bottom", () => {
    expect(shouldAutoScrollConsole(300, 200, 520)).toBe(true);
    expect(shouldAutoScrollConsole(200, 200, 520)).toBe(false);
  });
});
