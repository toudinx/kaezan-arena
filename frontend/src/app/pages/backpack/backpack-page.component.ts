import { Component, OnInit } from "@angular/core";
import { RouterLink } from "@angular/router";
import { type CharacterState, type EquipmentDefinition, type ItemDefinition } from "../../api/account-api.service";
import { AccountStore } from "../../account/account-store.service";
import {
  type BackpackAssignRequest,
  type BackpackAssignTarget,
  type BackpackCharacterBadge,
  BackpackWindowComponent
} from "../../shared/backpack/backpack-window.component";
import { type BackpackSlot, mapInventoryToBackpackSlots } from "../../shared/backpack/backpack-inventory.helpers";
import {
  resolveCharacterDisplayName,
  resolveCharacterPortraitVisual
} from "../../shared/characters/character-visuals.helpers";

@Component({
  selector: "app-backpack-page",
  standalone: true,
  imports: [RouterLink, BackpackWindowComponent],
  templateUrl: "./backpack-page.component.html",
  styleUrl: "./backpack-page.component.css"
})
export class BackpackPageComponent implements OnInit {
  equipInFlight = false;
  salvageInFlight = false;
  actionFeedbackMessage = "";
  actionFeedbackIsError = false;

  constructor(private readonly accountStore: AccountStore) {}

  async ngOnInit(): Promise<void> {
    try {
      await this.accountStore.load();
    } catch {
      // Render reads store error state.
    }
  }

  get isLoading(): boolean {
    return this.accountStore.isLoading();
  }

  get errorMessage(): string | null {
    return this.accountStore.error();
  }

  get activeCharacter(): CharacterState | null {
    return this.accountStore.activeCharacter();
  }

  get allCharacters(): ReadonlyArray<CharacterState> {
    const state = this.accountStore.state();
    if (!state) {
      return [];
    }

    return Object.values(state.characters).sort((left, right) => {
      const leftName = resolveCharacterDisplayName({ characterId: left.characterId, preferredName: left.name });
      const rightName = resolveCharacterDisplayName({ characterId: right.characterId, preferredName: right.name });
      const byName = leftName.localeCompare(rightName, undefined, { sensitivity: "base" });
      return byName !== 0 ? byName : left.characterId.localeCompare(right.characterId);
    });
  }

  get accountBackpackSlots(): BackpackSlot[] {
    const slots: BackpackSlot[] = [];
    for (const character of this.allCharacters) {
      slots.push(
        ...mapInventoryToBackpackSlots(
          character,
          this.itemCatalogById,
          this.equipmentCatalogByItemId
        )
      );
    }

    return slots.sort((left, right) => {
      const byEquipped = Number(right.isEquipped) - Number(left.isEquipped);
      if (byEquipped !== 0) {
        return byEquipped;
      }

      const rarityWeight = this.rarityWeight(right.rarityClass) - this.rarityWeight(left.rarityClass);
      if (rarityWeight !== 0) {
        return rarityWeight;
      }

      const byName = left.displayName.localeCompare(right.displayName, undefined, { sensitivity: "base" });
      if (byName !== 0) {
        return byName;
      }

      return left.instanceId.localeCompare(right.instanceId, undefined, { sensitivity: "base" });
    });
  }

  get equippedBadgeByInstanceId(): Readonly<Record<string, BackpackCharacterBadge>> {
    const result: Record<string, BackpackCharacterBadge> = {};
    for (const character of this.allCharacters) {
      const equippedWeaponId = character.equipment.weaponInstanceId;
      if (!equippedWeaponId) {
        continue;
      }

      const portrait = resolveCharacterPortraitVisual({
        characterId: character.characterId,
        displayName: character.name,
        context: "kaelis"
      });
      result[equippedWeaponId] = {
        characterId: character.characterId,
        characterName: resolveCharacterDisplayName({
          characterId: character.characterId,
          preferredName: character.name
        }),
        imageUrl: portrait.imageUrl ?? portrait.runImageUrl ?? null,
        monogram: portrait.monogram,
        tone: portrait.tone
      };
    }

    return result;
  }

  get assignTargets(): ReadonlyArray<BackpackAssignTarget> {
    return this.allCharacters.map((character) => ({
      characterId: character.characterId,
      characterName: resolveCharacterDisplayName({
        characterId: character.characterId,
        preferredName: character.name
      })
    }));
  }

  get activeCharacterName(): string {
    return resolveCharacterDisplayName({
      characterId: this.activeCharacter?.characterId,
      preferredName: this.activeCharacter?.name ?? "No active Kaelis"
    });
  }

  get activeCharacterMasteryLevel(): number {
    return Math.max(0, this.activeCharacter?.masteryLevel ?? 0);
  }

  get activeCharacterMasteryXp(): number {
    return Math.max(0, this.activeCharacter?.masteryXp ?? 0);
  }

  get equipableSlotCount(): number {
    return 1;
  }

  get echoFragmentsBalance(): number {
    return Math.max(0, this.accountStore.state()?.echoFragmentsBalance ?? 0);
  }

  get accountLevel(): number {
    return Math.max(1, Math.floor(this.accountStore.state()?.accountLevel ?? 1));
  }

  get equippedItemsCount(): number {
    return this.accountBackpackSlots.filter((slot) => slot.isEquipped).length;
  }

  get storedItemsCount(): number {
    return Math.max(0, this.accountBackpackSlots.length - this.equippedItemsCount);
  }

  get itemCatalogById(): Readonly<Record<string, ItemDefinition>> {
    return this.accountStore.catalogs().itemById;
  }

  get equipmentCatalogByItemId(): Readonly<Record<string, EquipmentDefinition>> {
    return this.accountStore.catalogs().equipmentById;
  }

  async onAssignRequested(request: BackpackAssignRequest): Promise<void> {
    if (this.equipInFlight) {
      return;
    }

    this.equipInFlight = true;
    this.actionFeedbackMessage = "";
    this.actionFeedbackIsError = false;

    try {
      await this.accountStore.equipItem(request.characterId, "weapon", request.instanceId);
      await this.accountStore.refresh();
      const assignedCharacterName = this.allCharacters.find((item) => item.characterId === request.characterId)?.name ?? "Kaelis";
      this.actionFeedbackMessage = `Weapon assigned to ${assignedCharacterName}.`;
      this.actionFeedbackIsError = false;
    } catch (error) {
      const storeError = this.accountStore.error();
      this.actionFeedbackMessage = storeError ?? String(error);
      this.actionFeedbackIsError = true;
    } finally {
      this.equipInFlight = false;
    }
  }

  async onSalvageRequested(instanceId: string): Promise<void> {
    const character = this.activeCharacter;
    if (!character || this.salvageInFlight) {
      return;
    }

    this.salvageInFlight = true;
    this.actionFeedbackMessage = "";
    this.actionFeedbackIsError = false;

    try {
      const result = await this.accountStore.salvageItem(instanceId);
      await this.accountStore.refresh();
      this.actionFeedbackMessage = `Item salvaged: +${result.primalCoreAwarded} Primal Core`;
      this.actionFeedbackIsError = false;
    } catch (error) {
      const storeError = this.accountStore.error();
      this.actionFeedbackMessage = storeError ?? String(error);
      this.actionFeedbackIsError = true;
    } finally {
      this.salvageInFlight = false;
    }
  }

  private rarityWeight(rarityClass: BackpackSlot["rarityClass"]): number {
    if (rarityClass === "ascendant") {
      return 5;
    }
    if (rarityClass === "legendary") {
      return 4;
    }
    if (rarityClass === "epic") {
      return 3;
    }
    if (rarityClass === "rare") {
      return 2;
    }
    return 1;
  }
}
