import { Component, OnInit } from "@angular/core";
import {
  AccountApiService,
  type BestiaryCraftSlot,
  type BestiaryOverviewResponse,
  type CharacterState,
  type EquipmentDefinition
} from "../../api/account-api.service";

type BestiaryRow = Readonly<{
  speciesId: string;
  displayName: string;
  killsTotal: number;
  primalCoreBalance: number;
}>;

type InventoryRow = Readonly<{
  instanceId: string;
  definitionId: string;
  displayName: string;
  slotLabel: string;
  rarityLabel: string;
  rarityKey: string;
  originSpeciesLabel: string | null;
  originSpeciesId: string | null;
  canRefine: boolean;
  canAffordRefine: boolean;
  nextRarityLabel: string | null;
  refinePrimalCoreCost: number | null;
  refineEchoFragmentsCost: number | null;
  canSalvage: boolean;
  salvagePrimalCoreReturn: number | null;
}>;

type RefineRule = Readonly<{
  nextRarity: string;
  primalCoreCost: number;
  echoFragmentsCost: number;
}>;

@Component({
  selector: "app-bestiary-page",
  standalone: true,
  templateUrl: "./bestiary-page.component.html",
  styleUrl: "./bestiary-page.component.css"
})
export class BestiaryPageComponent implements OnInit {
  readonly primalCoreCost = 20;
  readonly echoFragmentsCost = 100;
  readonly accountId = "dev_account";
  speciesRows: BestiaryRow[] = [];
  selectedSpeciesId: string | null = null;
  isLoading = true;
  isCrafting = false;
  refiningItemInstanceId: string | null = null;
  salvagingItemInstanceId: string | null = null;
  loadError: string | null = null;
  actionFeedback: string | null = null;
  characterName = "";
  characterId = "";
  echoFragmentsBalance = 0;
  lastUpdatedItemInstanceId: string | null = null;
  activeCharacter: CharacterState | null = null;
  equipmentById: Record<string, EquipmentDefinition> = {};

  constructor(private readonly accountApi: AccountApiService) {}

  async ngOnInit(): Promise<void> {
    await this.loadBestiary();
  }

  get selectedSpecies(): BestiaryRow | null {
    if (!this.selectedSpeciesId) {
      return null;
    }

    return this.speciesRows.find((row) => row.speciesId === this.selectedSpeciesId) ?? null;
  }

  selectSpecies(speciesId: string): void {
    this.selectedSpeciesId = speciesId;
  }

  get canCraftSelectedSpecies(): boolean {
    const selected = this.selectedSpecies;
    if (!selected) {
      return false;
    }

    return selected.primalCoreBalance >= this.primalCoreCost && this.echoFragmentsBalance >= this.echoFragmentsCost;
  }

  get inventoryRows(): InventoryRow[] {
    const character = this.activeCharacter;
    if (!character) {
      return [];
    }

    const equipmentInstances = Object.values(character.inventory.equipmentInstances ?? {});
    const primalCoreBySpecies = character.primalCoreBySpecies ?? {};
    return equipmentInstances
      .map((instance) => {
        const definition = this.equipmentById[instance.definitionId];
        const slotValue = instance.slot ?? definition?.slot ?? "unknown";
        const rarityKey = this.normalizeRarity(instance.rarity) ?? "unknown";
        const refineRule = this.resolveRefineRule(rarityKey);
        const originSpeciesId = instance.originSpeciesId ?? null;
        const hasOriginSpecies = originSpeciesId !== null;
        const canRefine = hasOriginSpecies && refineRule !== null;
        const speciesPrimalCore = originSpeciesId ? primalCoreBySpecies[originSpeciesId] ?? 0 : 0;
        const canAffordRefine =
          canRefine &&
          refineRule !== null &&
          speciesPrimalCore >= refineRule.primalCoreCost &&
          this.echoFragmentsBalance >= refineRule.echoFragmentsCost;
        const salvagePrimalCoreReturn = this.resolveSalvagePrimalCoreReturn(rarityKey);
        const canSalvage = hasOriginSpecies && salvagePrimalCoreReturn !== null;
        return {
          instanceId: instance.instanceId,
          definitionId: instance.definitionId,
          displayName: definition?.itemId ? this.resolveEquipmentName(definition.itemId) : instance.definitionId,
          slotLabel: slotValue,
          rarityLabel: this.formatRarityLabel(rarityKey),
          rarityKey,
          originSpeciesLabel: originSpeciesId ? this.toSpeciesLabel(originSpeciesId) : null,
          originSpeciesId,
          canRefine,
          canAffordRefine,
          nextRarityLabel: refineRule ? this.formatRarityLabel(refineRule.nextRarity) : null,
          refinePrimalCoreCost: refineRule?.primalCoreCost ?? null,
          refineEchoFragmentsCost: refineRule?.echoFragmentsCost ?? null,
          canSalvage,
          salvagePrimalCoreReturn
        };
      })
      .sort((left, right) => left.instanceId.localeCompare(right.instanceId));
  }

  async craftWeapon(): Promise<void> {
    await this.craftSelectedSpecies("Weapon");
  }

  async craftArmor(): Promise<void> {
    await this.craftSelectedSpecies("Armor");
  }

  async craftRelic(): Promise<void> {
    await this.craftSelectedSpecies("Relic");
  }

  private async craftSelectedSpecies(slot: BestiaryCraftSlot): Promise<void> {
    const selected = this.selectedSpecies;
    if (!selected) {
      return;
    }

    this.actionFeedback = null;
    this.isCrafting = true;
    try {
      const crafted = await this.accountApi.craftBestiaryItem(this.accountId, selected.speciesId, slot);
      this.echoFragmentsBalance = Math.max(0, crafted.echoFragmentsBalance);
      this.activeCharacter = crafted.character;
      this.characterName = crafted.character.name;
      this.characterId = crafted.character.characterId;
      this.lastUpdatedItemInstanceId = crafted.craftedItem.instanceId;
      this.applyCharacterProgress(crafted.character);

      const craftedLabel = this.resolveEquipmentName(crafted.craftedItem.definitionId);
      this.actionFeedback = `Crafted ${craftedLabel} from ${selected.displayName}.`;
    } catch (error) {
      this.actionFeedback = this.stringifyError(error);
    } finally {
      this.isCrafting = false;
    }
  }

  async refineItem(item: InventoryRow): Promise<void> {
    if (!item.canRefine) {
      return;
    }

    this.actionFeedback = null;
    this.refiningItemInstanceId = item.instanceId;
    try {
      const refined = await this.accountApi.refineItem(this.accountId, item.instanceId);
      this.echoFragmentsBalance = Math.max(0, refined.echoFragmentsBalance);
      this.activeCharacter = refined.character;
      this.characterName = refined.character.name;
      this.characterId = refined.character.characterId;
      this.lastUpdatedItemInstanceId = refined.refinedItem.instanceId;
      this.applyCharacterProgress(refined.character);
      this.actionFeedback = `Refined ${item.displayName} to ${this.formatRarityLabel(this.normalizeRarity(refined.refinedItem.rarity) ?? "unknown")}.`;
    } catch (error) {
      this.actionFeedback = this.stringifyError(error);
    } finally {
      this.refiningItemInstanceId = null;
    }
  }

  async salvageItem(item: InventoryRow): Promise<void> {
    if (!item.canSalvage || item.salvagePrimalCoreReturn === null) {
      return;
    }

    const originSpeciesLabel = item.originSpeciesLabel ?? "Unknown";
    const confirmed = window.confirm(
      `Salvage ${item.displayName}?\nYou will receive ${item.salvagePrimalCoreReturn} Primal Core for ${originSpeciesLabel}.`
    );
    if (!confirmed) {
      return;
    }

    this.actionFeedback = null;
    this.salvagingItemInstanceId = item.instanceId;
    try {
      const salvaged = await this.accountApi.salvageItem(this.accountId, item.instanceId);
      this.echoFragmentsBalance = Math.max(0, salvaged.echoFragmentsBalance);
      this.activeCharacter = salvaged.character;
      this.characterName = salvaged.character.name;
      this.characterId = salvaged.character.characterId;
      this.lastUpdatedItemInstanceId = null;
      this.applyCharacterProgress(salvaged.character);
      this.actionFeedback = `Salvaged ${item.displayName}: +${salvaged.primalCoreAwarded} Primal Core (${this.toSpeciesLabel(salvaged.speciesId)}).`;
    } catch (error) {
      this.actionFeedback = this.stringifyError(error);
    } finally {
      this.salvagingItemInstanceId = null;
    }
  }

  private async loadBestiary(): Promise<void> {
    this.isLoading = true;
    this.loadError = null;
    try {
      const [overview, state] = await Promise.all([
        this.accountApi.getBestiaryOverview(this.accountId),
        this.accountApi.getState(this.accountId)
      ]);
      const activeCharacter = state.account.characters[state.account.activeCharacterId] ?? null;
      const selectedSpeciesId = this.selectedSpeciesId;
      this.characterName = overview.character.name;
      this.characterId = overview.character.characterId;
      this.echoFragmentsBalance = state.account.echoFragmentsBalance;
      this.activeCharacter = activeCharacter;
      this.equipmentById = this.toEquipmentById(state.equipmentCatalog);
      this.speciesRows = this.buildRows(overview);
      this.selectedSpeciesId =
        selectedSpeciesId && this.speciesRows.some((row) => row.speciesId === selectedSpeciesId)
          ? selectedSpeciesId
          : this.speciesRows[0]?.speciesId ?? null;
    } catch (error) {
      this.loadError = this.stringifyError(error);
      this.speciesRows = [];
      this.selectedSpeciesId = null;
      this.characterName = "";
      this.characterId = "";
      this.echoFragmentsBalance = 0;
      this.activeCharacter = null;
      this.equipmentById = {};
    } finally {
      this.isLoading = false;
    }
  }

  private buildRows(overview: BestiaryOverviewResponse): BestiaryRow[] {
    const killsBySpecies = overview.character.bestiaryKillsBySpecies ?? {};
    const primalCoreBySpecies = overview.character.primalCoreBySpecies ?? {};
    const knownRows = overview.speciesCatalog.map((species) =>
      this.buildSpeciesRow(species.speciesId, species.displayName, killsBySpecies, primalCoreBySpecies)
    );
    const knownIds = new Set(overview.speciesCatalog.map((species) => species.speciesId));
    const extraIds = Array.from(
      new Set<string>([...Object.keys(killsBySpecies), ...Object.keys(primalCoreBySpecies)])
    )
      .filter((speciesId) => !knownIds.has(speciesId))
      .sort((left, right) => left.localeCompare(right));
    const extraRows = extraIds.map((speciesId) =>
      this.buildSpeciesRow(speciesId, this.toSpeciesLabel(speciesId), killsBySpecies, primalCoreBySpecies)
    );

    return [...knownRows, ...extraRows];
  }

  private buildSpeciesRow(
    speciesId: string,
    displayName: string,
    killsBySpecies: Record<string, number>,
    primalCoreBySpecies: Record<string, number>
  ): BestiaryRow {
    return {
      speciesId,
      displayName,
      killsTotal: Math.max(0, killsBySpecies[speciesId] ?? 0),
      primalCoreBalance: Math.max(0, primalCoreBySpecies[speciesId] ?? 0)
    };
  }

  private applyCharacterProgress(character: CharacterState): void {
    const killsBySpecies = character.bestiaryKillsBySpecies ?? {};
    const primalCoreBySpecies = character.primalCoreBySpecies ?? {};
    this.speciesRows = this.speciesRows.map((row) => ({
      ...row,
      killsTotal: Math.max(0, killsBySpecies[row.speciesId] ?? 0),
      primalCoreBalance: Math.max(0, primalCoreBySpecies[row.speciesId] ?? 0)
    }));
  }

  private resolveEquipmentName(itemId: string): string {
    const definition = this.equipmentById[itemId];
    if (!definition) {
      return itemId;
    }

    return itemId
      .replace(/^wpn\./, "")
      .replace(/^arm\./, "")
      .replace(/^rel\./, "")
      .split("_")
      .map((chunk) => chunk.charAt(0).toUpperCase() + chunk.slice(1))
      .join(" ");
  }

  private toEquipmentById(catalog: EquipmentDefinition[]): Record<string, EquipmentDefinition> {
    const byId: Record<string, EquipmentDefinition> = {};
    for (const entry of catalog) {
      byId[entry.itemId] = entry;
    }

    return byId;
  }

  private resolveRefineRule(rarity: string): RefineRule | null {
    switch (rarity) {
      case "common":
        return { nextRarity: "rare", primalCoreCost: 40, echoFragmentsCost: 200 };
      case "rare":
        return { nextRarity: "epic", primalCoreCost: 120, echoFragmentsCost: 500 };
      case "epic":
        return { nextRarity: "legendary", primalCoreCost: 300, echoFragmentsCost: 1000 };
      default:
        return null;
    }
  }

  private resolveSalvagePrimalCoreReturn(rarity: string): number | null {
    switch (rarity) {
      case "common":
        return 12;
      case "rare":
        return 28;
      case "epic":
        return 96;
      case "legendary":
        return 250;
      default:
        return null;
    }
  }

  private normalizeRarity(rarity: string | null | undefined): string | null {
    if (!rarity) {
      return null;
    }

    return rarity.trim().toLowerCase();
  }

  private formatRarityLabel(rarity: string): string {
    if (!rarity) {
      return "Unknown";
    }

    return rarity.charAt(0).toUpperCase() + rarity.slice(1);
  }

  private toSpeciesLabel(speciesId: string): string {
    return speciesId
      .split("_")
      .filter((chunk) => chunk.length > 0)
      .map((chunk) => chunk[0].toUpperCase() + chunk.slice(1))
      .join(" ");
  }

  private stringifyError(error: unknown): string {
    if (!error) {
      return "Unknown error";
    }

    return error instanceof Error ? error.message : String(error);
  }
}
