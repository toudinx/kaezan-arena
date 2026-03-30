import { Component, OnInit } from "@angular/core";
import {
  type BestiaryCraftSlot,
  type BestiarySpecies,
  type CharacterState
} from "../../api/account-api.service";
import { AccountStore } from "../../account/account-store.service";
import { mapInventoryToBackpackSlots } from "../../shared/backpack/backpack-inventory.helpers";

type BestiaryRow = Readonly<{
  speciesId: string;
  displayName: string;
  killsTotal: number;
  primalCoreBalance: number;
  nextKillMilestone: number;
  killsToNextMilestone: number;
  progressPercent: number;
  rank: number;
}>;

type InventoryRow = Readonly<{
  instanceId: string;
  displayName: string;
  slotLabel: string;
  rarityLabel: string;
  rarityKey: string;
  originSpeciesLabel: string | null;
  originSpeciesId: string | null;
  isEquipped: boolean;
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

const KILL_MILESTONE_STEP = 25;

@Component({
  selector: "app-bestiary-page",
  standalone: true,
  templateUrl: "./bestiary-page.component.html",
  styleUrl: "./bestiary-page.component.css"
})
export class BestiaryPageComponent implements OnInit {
  readonly primalCoreCost = 20;
  readonly echoFragmentsCost = 100;
  speciesRows: BestiaryRow[] = [];
  selectedSpeciesId: string | null = null;
  searchQuery = "";
  isCrafting = false;
  refiningItemInstanceId: string | null = null;
  salvagingItemInstanceId: string | null = null;
  actionFeedback: string | null = null;
  lastUpdatedItemInstanceId: string | null = null;

  constructor(private readonly accountStore: AccountStore) {}

  async ngOnInit(): Promise<void> {
    await this.loadBestiary();
  }

  get isLoading(): boolean {
    return this.accountStore.isLoading();
  }

  get loadError(): string | null {
    return this.accountStore.error();
  }

  get activeCharacter(): CharacterState | null {
    return this.accountStore.activeCharacter();
  }

  get hasCharacter(): boolean {
    return !!this.activeCharacter;
  }

  get characterName(): string {
    const char = this.activeCharacter;
    if (!char) return "";
    const catalogEntry = this.accountStore.catalogs().characterById[char.characterId];
    return catalogEntry?.displayName ?? char.name;
  }

  get characterId(): string {
    return this.activeCharacter?.characterId ?? "";
  }

  get echoFragmentsBalance(): number {
    return Math.max(0, this.accountStore.state()?.echoFragmentsBalance ?? 0);
  }

  get totalKillsAcrossSpecies(): number {
    return this.speciesRows.reduce((total, row) => total + row.killsTotal, 0);
  }

  get speciesUnlockedCount(): number {
    return this.speciesRows.filter((row) => row.killsTotal > 0).length;
  }

  get filteredSpeciesRows(): BestiaryRow[] {
    const query = this.searchQuery.trim().toLowerCase();
    if (query.length === 0) {
      return this.speciesRows;
    }

    return this.speciesRows.filter((row) =>
      row.displayName.toLowerCase().includes(query) ||
      row.speciesId.toLowerCase().includes(query)
    );
  }

  get selectedSpecies(): BestiaryRow | null {
    if (!this.selectedSpeciesId) {
      return null;
    }

    return this.speciesRows.find((row) => row.speciesId === this.selectedSpeciesId) ?? null;
  }

  get selectedSpeciesName(): string {
    return this.selectedSpecies?.displayName ?? "No species selected";
  }

  get selectedSpeciesProgressLabel(): string {
    const selected = this.selectedSpecies;
    if (!selected) {
      return "";
    }

    return `${selected.killsToNextMilestone} kills to milestone ${selected.nextKillMilestone}`;
  }

  selectSpecies(speciesId: string): void {
    this.selectedSpeciesId = speciesId;
  }

  onSearchInput(event: Event): void {
    const input = event.target;
    this.searchQuery = input instanceof HTMLInputElement ? input.value : "";
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

    const slots = mapInventoryToBackpackSlots(
      character,
      this.accountStore.catalogs().itemById,
      this.accountStore.catalogs().equipmentById
    );
    const primalCoreBySpecies = character.primalCoreBySpecies ?? {};
    return slots
      .map((slot) => {
        const rarityKey = this.normalizeRarity(slot.rarity) ?? "unknown";
        const refineRule = this.resolveRefineRule(rarityKey);
        const originSpeciesId = slot.originSpeciesId ?? null;
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
          instanceId: slot.instanceId,
          displayName: slot.displayName,
          slotLabel: slot.slot,
          rarityLabel: this.formatRarityLabel(rarityKey),
          rarityKey,
          originSpeciesLabel: originSpeciesId ? this.toSpeciesLabel(originSpeciesId) : null,
          originSpeciesId,
          isEquipped: slot.isEquipped,
          canRefine,
          canAffordRefine,
          nextRarityLabel: refineRule ? this.formatRarityLabel(refineRule.nextRarity) : null,
          refinePrimalCoreCost: refineRule?.primalCoreCost ?? null,
          refineEchoFragmentsCost: refineRule?.echoFragmentsCost ?? null,
          canSalvage,
          salvagePrimalCoreReturn
        };
      })
      .sort((left, right) => {
        if (left.originSpeciesId === this.selectedSpeciesId && right.originSpeciesId !== this.selectedSpeciesId) {
          return -1;
        }

        if (right.originSpeciesId === this.selectedSpeciesId && left.originSpeciesId !== this.selectedSpeciesId) {
          return 1;
        }

        return left.displayName.localeCompare(right.displayName, undefined, { sensitivity: "base" });
      });
  }

  get selectedSpeciesInventoryRows(): InventoryRow[] {
    const selected = this.selectedSpecies;
    if (!selected) {
      return [];
    }

    return this.inventoryRows.filter((item) => item.originSpeciesId === selected.speciesId);
  }

  get selectedSpeciesRefineRows(): InventoryRow[] {
    return this.selectedSpeciesInventoryRows.filter((item) => item.canRefine);
  }

  get selectedSpeciesSalvageRows(): InventoryRow[] {
    return this.selectedSpeciesInventoryRows.filter((item) => item.canSalvage);
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
      const crafted = await this.accountStore.craftBestiaryItem(selected.speciesId, slot);
      this.lastUpdatedItemInstanceId = crafted.craftedItem.instanceId;
      this.syncBestiaryRows();
      const craftedLabel = this.accountStore.catalogs().itemById[crafted.craftedItem.definitionId]?.displayName ??
        crafted.craftedItem.definitionId;
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
      const refined = await this.accountStore.refineItem(item.instanceId);
      this.lastUpdatedItemInstanceId = refined.refinedItem.instanceId;
      this.syncBestiaryRows();
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
      const salvaged = await this.accountStore.salvageItem(item.instanceId);
      this.lastUpdatedItemInstanceId = null;
      this.syncBestiaryRows();
      this.actionFeedback = `Salvaged ${item.displayName}: +${salvaged.primalCoreAwarded} Primal Core (${this.toSpeciesLabel(salvaged.speciesId)}).`;
    } catch (error) {
      this.actionFeedback = this.stringifyError(error);
    } finally {
      this.salvagingItemInstanceId = null;
    }
  }

  private async loadBestiary(): Promise<void> {
    try {
      await this.accountStore.load();
      this.syncBestiaryRows();
    } catch {
      this.speciesRows = [];
      this.selectedSpeciesId = null;
    }
  }

  private syncBestiaryRows(): void {
    const selectedSpeciesId = this.selectedSpeciesId;
    const speciesCatalog = this.accountStore.catalogs().speciesCatalog;
    this.speciesRows = this.buildRows(speciesCatalog, this.activeCharacter);
    this.selectedSpeciesId =
      selectedSpeciesId && this.speciesRows.some((row) => row.speciesId === selectedSpeciesId)
        ? selectedSpeciesId
        : this.speciesRows[0]?.speciesId ?? null;
  }

  private buildRows(speciesCatalog: ReadonlyArray<BestiarySpecies>, character: CharacterState | null): BestiaryRow[] {
    const killsBySpecies = character?.bestiaryKillsBySpecies ?? {};
    const primalCoreBySpecies = character?.primalCoreBySpecies ?? {};
    const knownRows = speciesCatalog.map((species) =>
      this.buildSpeciesRow(species.speciesId, species.displayName, killsBySpecies, primalCoreBySpecies)
    );
    const knownIds = new Set(speciesCatalog.map((species) => species.speciesId));
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
    const killsTotal = Math.max(0, killsBySpecies[speciesId] ?? 0);
    const nextKillMilestone = this.resolveNextKillMilestone(killsTotal);
    const previousMilestone = Math.max(0, nextKillMilestone - KILL_MILESTONE_STEP);
    const progressInTier = Math.max(0, killsTotal - previousMilestone);
    const progressPercent = Math.max(
      0,
      Math.min(100, (progressInTier / KILL_MILESTONE_STEP) * 100)
    );

    return {
      speciesId,
      displayName,
      killsTotal,
      primalCoreBalance: Math.max(0, primalCoreBySpecies[speciesId] ?? 0),
      nextKillMilestone,
      killsToNextMilestone: Math.max(0, nextKillMilestone - killsTotal),
      progressPercent,
      rank: Math.floor(killsTotal / KILL_MILESTONE_STEP)
    };
  }

  private resolveNextKillMilestone(killsTotal: number): number {
    const tier = Math.floor(Math.max(0, killsTotal) / KILL_MILESTONE_STEP);
    return Math.max(KILL_MILESTONE_STEP, (tier + 1) * KILL_MILESTONE_STEP);
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
