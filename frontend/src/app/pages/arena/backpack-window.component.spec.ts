import type { CharacterState, EquipmentDefinition, ItemDefinition } from "../../api/account-api.service";
import { BackpackWindowComponent } from "./backpack-window.component";

describe("BackpackWindowComponent", () => {
  function createComponent(): BackpackWindowComponent {
    const host = document.createElement("div");
    Object.defineProperty(host, "getBoundingClientRect", {
      value: () => ({
        left: 100,
        top: 50,
        width: 320,
        height: 220,
        right: 420,
        bottom: 270,
        x: 100,
        y: 50,
        toJSON: () => ({})
      })
    });

    return new BackpackWindowComponent({ nativeElement: host } as never);
  }

  function assignInventoryInputs(component: BackpackWindowComponent): void {
    const character: CharacterState = {
      characterId: "char-01",
      name: "Kaelis",
      level: 13,
      xp: 1500,
      equipment: {
        weaponInstanceId: null
      },
      inventory: {
        materialStacks: {
          herb: 14
        },
        equipmentInstances: {
          "wpn-01": {
            instanceId: "wpn-01",
            definitionId: "blade_alpha",
            isLocked: false
          }
        }
      }
    };
    const itemCatalogById: Record<string, ItemDefinition> = {
      herb: { itemId: "herb", displayName: "Herb", kind: "material", stackable: true, rarity: "common" },
      blade_alpha: { itemId: "blade_alpha", displayName: "Axe of Dawn", kind: "equipment", stackable: false, rarity: "epic" }
    };
    const equipmentCatalogByItemId: Record<string, EquipmentDefinition> = {
      blade_alpha: { itemId: "blade_alpha", slot: "weapon", weaponClass: "axe", gameplayModifiers: {} }
    };

    component.character = character;
    component.itemCatalogById = itemCatalogById;
    component.equipmentCatalogByItemId = equipmentCatalogByItemId;
  }

  it("dispatches equip action to equipRequested for weapon slots", () => {
    const component = createComponent();
    assignInventoryInputs(component);
    const emitted: string[] = [];
    component.equipRequested.subscribe((instanceId) => emitted.push(instanceId));

    const weaponSlot = component.allSlots.find((slot) => slot.kind === "equipment" && slot.isWeapon);
    expect(weaponSlot).toBeTruthy();

    component.selectSlot(weaponSlot!.slotId);
    component.onSlotContextMenu(
      weaponSlot!,
      new MouseEvent("contextmenu", { clientX: 140, clientY: 120, bubbles: true })
    );
    component.onContextMenuAction("equip");

    expect(emitted).toEqual(["wpn-01"]);
    expect(component.contextMenu).toBeNull();
  });

  it("inspect action opens inspect popup for selected slot", () => {
    const component = createComponent();
    assignInventoryInputs(component);
    const materialSlot = component.allSlots.find((slot) => slot.kind === "material");
    expect(materialSlot).toBeTruthy();

    component.selectSlot(materialSlot!.slotId);
    component.onSlotContextMenu(
      materialSlot!,
      new MouseEvent("contextmenu", { clientX: 150, clientY: 120, bubbles: true })
    );
    component.onContextMenuAction("inspect");

    expect(component.inspectSlotId).toBe(materialSlot!.slotId);
    expect(component.contextMenu).toBeNull();
  });

  it("clicking weapon slot in weapon filter mode triggers equip flow directly", () => {
    const component = createComponent();
    assignInventoryInputs(component);
    component.weaponFilterMode = true;
    const emitted: string[] = [];
    component.equipRequested.subscribe((instanceId) => emitted.push(instanceId));

    const weaponSlot = component.allSlots.find((slot) => slot.kind === "equipment" && slot.isWeapon);
    expect(weaponSlot).toBeTruthy();

    component.selectSlot(weaponSlot!.slotId);

    expect(emitted).toEqual(["wpn-01"]);
  });
});
