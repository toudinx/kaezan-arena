import { Component, Input, OnInit, computed, effect, signal } from "@angular/core";
import {
  type AscendantTierProgress,
  type BestiaryCraftSlot,
  type BestiarySpecies,
  type CharacterState
} from "../../api/account-api.service";
import { AccountStore } from "../../account/account-store.service";
import { mapInventoryToBackpackSlots } from "../../shared/backpack/backpack-inventory.helpers";
import { type SpeciesVisual, resolveSpeciesVisual } from "../../shared/bestiary/species-visuals.helpers";
import { type ItemIconTone } from "../../shared/items/item-visuals.helpers";

type BestiaryRow = Readonly<{
  speciesId: string;
  displayName: string;
  visual: SpeciesVisual;
  killsTotal: number;
  primalCoreBalance: number;
  nextKillMilestone: number;
  killsToNextMilestone: number;
  progressPercent: number;
  rank: number;
  isMaxRank: boolean;
}>;

type InventoryRow = Readonly<{
  instanceId: string;
  displayName: string;
  slotKey: string;
  slotLabel: string;
  typeLabel: string;
  rarityLabel: string;
  rarityKey: string;
  iconImageUrl: string | null;
  iconGlyph: string;
  iconTone: ItemIconTone;
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

type LootGroup = Readonly<{
  slotKey: string;
  slotLabel: string;
  items: ReadonlyArray<InventoryRow>;
}>;

const LOOT_SLOT_ORDER: Readonly<Record<string, number>> = {
  weapon: 0,
  unknown: 1
};

function computeRank(killsTotal: number, thresholds: ReadonlyArray<number>): number {
  const kills = Math.max(0, killsTotal);
  let rank = 1;
  for (let i = thresholds.length - 1; i >= 0; i--) {
    if (kills >= thresholds[i]) {
      rank = i + 1;
      break;
    }
  }
  return rank;
}

@Component({
  selector: "app-bestiary-page",
  standalone: true,
  templateUrl: "./bestiary-page.component.html",
  styleUrl: "./bestiary-page.component.css"
})
export class BestiaryPageComponent implements OnInit {
  readonly primalCoreCost = 20;
  readonly echoFragmentsCost = 100;
  readonly speciesPageSize = 8;
  private readonly contextCharacterIdSignal = signal<string | null>(null);
  private readonly selectedSpeciesIdSignal = signal<string | null>(null);
  private readonly searchQuerySignal = signal("");
  private readonly speciesPageSignal = signal(0);
  private readonly scopedCharacterSignal = computed(() => this.resolveScopedCharacter(this.contextCharacterIdSignal()));
  private readonly speciesRowsSignal = computed(() =>
    this.buildRows(
      this.accountStore.catalogs().speciesCatalog,
      this.scopedCharacterSignal(),
      this.accountStore.catalogs().bestiaryRankThresholds
    )
  );
  private readonly filteredSpeciesRowsSignal = computed(() => {
    const query = this.searchQuerySignal().trim().toLowerCase();
    const filtered = query.length === 0
      ? this.speciesRowsSignal()
      : this.speciesRowsSignal().filter((row) =>
          row.displayName.toLowerCase().includes(query) ||
          row.speciesId.toLowerCase().includes(query)
        );
    return [...filtered].sort((a, b) => {
      const aHasKills = a.killsTotal > 0 ? 1 : 0;
      const bHasKills = b.killsTotal > 0 ? 1 : 0;
      if (aHasKills !== bHasKills) return bHasKills - aHasKills;
      if (a.rank !== b.rank) return b.rank - a.rank;
      if (a.killsTotal !== b.killsTotal) return b.killsTotal - a.killsTotal;
      return a.displayName.localeCompare(b.displayName);
    });
  });
  isCrafting = false;
  refiningItemInstanceId: string | null = null;
  salvagingItemInstanceId: string | null = null;
  actionFeedback: string | null = null;
  lastUpdatedItemInstanceId: string | null = null;
  private readonly speciesImageFailures = new Set<string>();
  private readonly itemIconFailures = new Set<string>();
  private readonly maintainSelectionEffect = effect(() => {
    const rows = this.filteredSpeciesRowsSignal();
    const currentSelection = this.selectedSpeciesIdSignal();

    if (rows.length === 0) {
      if (currentSelection !== null) {
        this.selectedSpeciesIdSignal.set(null);
      }
      return;
    }

    if (!currentSelection || !rows.some((row) => row.speciesId === currentSelection)) {
      this.selectedSpeciesIdSignal.set(rows[0].speciesId);
    }
  }, { allowSignalWrites: true });
  private readonly maintainSpeciesPageEffect = effect(() => {
    const rows = this.filteredSpeciesRowsSignal();
    const currentPage = this.speciesPageSignal();
    const clamped = this.clampSpeciesPage(currentPage, rows.length);
    if (currentPage !== clamped) {
      this.speciesPageSignal.set(clamped);
    }
  }, { allowSignalWrites: true });

  constructor(private readonly accountStore: AccountStore) {}

  @Input() embedded = false;

  @Input() set contextCharacterId(value: string | null | undefined) {
    this.contextCharacterIdSignal.set(this.normalizeCharacterId(value));
  }

  async ngOnInit(): Promise<void> {
    try {
      await this.loadBestiary();
    } catch {
      // Render reads store error state.
    }
  }

  get isLoading(): boolean {
    return this.accountStore.isLoading();
  }

  get loadError(): string | null {
    return this.accountStore.error();
  }

  get activeCharacter(): CharacterState | null {
    return this.scopedCharacterSignal();
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

  get searchQuery(): string {
    return this.searchQuerySignal();
  }

  get filteredSpeciesRows(): BestiaryRow[] {
    return this.filteredSpeciesRowsSignal();
  }

  get filteredSpeciesCount(): number {
    return this.filteredSpeciesRows.length;
  }

  get filteredSpeciesKillsTotal(): number {
    return this.filteredSpeciesRows.reduce((total, row) => total + row.killsTotal, 0);
  }

  get speciesPageCount(): number {
    const count = this.filteredSpeciesRows.length;
    if (count === 0) {
      return 0;
    }
    return Math.ceil(count / this.speciesPageSize);
  }

  get speciesPageNumber(): number {
    return this.speciesPageCount === 0 ? 0 : this.speciesPageSignal() + 1;
  }

  get isSpeciesPageStart(): boolean {
    return this.speciesPageSignal() <= 0;
  }

  get isSpeciesPageEnd(): boolean {
    return this.speciesPageSignal() >= Math.max(0, this.speciesPageCount - 1);
  }

  get speciesPageWindowLabel(): string {
    const total = this.filteredSpeciesRows.length;
    if (total === 0) {
      return "0 / 0";
    }

    const start = this.speciesPageSignal() * this.speciesPageSize + 1;
    const end = Math.min(total, start + this.speciesPageSize - 1);
    return `${start}-${end} / ${total}`;
  }

  get pagedSpeciesRows(): BestiaryRow[] {
    const start = this.speciesPageSignal() * this.speciesPageSize;
    return this.filteredSpeciesRows.slice(start, start + this.speciesPageSize);
  }

  get selectedSpecies(): BestiaryRow | null {
    if (!this.selectedSpeciesId) {
      return null;
    }

    return this.speciesRows.find((row) => row.speciesId === this.selectedSpeciesId) ?? null;
  }

  get speciesRows(): BestiaryRow[] {
    return this.speciesRowsSignal();
  }

  get selectedSpeciesId(): string | null {
    return this.selectedSpeciesIdSignal();
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

  get ascendantProgressRows(): ReadonlyArray<AscendantTierProgress> {
    return this.scopedCharacterSignal()?.ascendantProgress?.filter((t) => t.speciesRequired > 0) ?? [];
  }

  get selectedSpeciesLootCount(): number {
    return this.selectedSpeciesInventoryRows.length;
  }

  shouldRenderSpeciesImage(imageUrl: string | null | undefined): boolean {
    if (!imageUrl) {
      return false;
    }

    return !this.speciesImageFailures.has(imageUrl);
  }

  onSpeciesImageError(imageUrl: string | null | undefined): void {
    if (!imageUrl) {
      return;
    }

    this.speciesImageFailures.add(imageUrl);
  }

  shouldRenderItemIcon(item: InventoryRow): boolean {
    return !!item.iconImageUrl && !this.itemIconFailures.has(item.instanceId);
  }

  onItemIconError(itemInstanceId: string): void {
    if (!itemInstanceId) {
      return;
    }

    this.itemIconFailures.add(itemInstanceId);
  }

  selectSpecies(speciesId: string): void {
    this.selectedSpeciesIdSignal.set(speciesId);
  }

  onSearchInput(event: Event): void {
    const input = event.target;
    this.searchQuerySignal.set(input instanceof HTMLInputElement ? input.value : "");
    this.speciesPageSignal.set(0);
  }

  goToPreviousSpeciesPage(): void {
    this.speciesPageSignal.update((page) => Math.max(0, page - 1));
  }

  goToNextSpeciesPage(): void {
    const maxPage = Math.max(0, this.speciesPageCount - 1);
    this.speciesPageSignal.update((page) => Math.min(maxPage, page + 1));
  }

  get canCraftSelectedSpecies(): boolean {
    const selected = this.selectedSpecies;
    if (!selected) {
      return false;
    }

    return selected.primalCoreBalance >= this.primalCoreCost && this.echoFragmentsBalance >= this.echoFragmentsCost;
  }

  get primalCoreDeficit(): number {
    const selected = this.selectedSpecies;
    if (!selected) return 0;
    return Math.max(0, this.primalCoreCost - selected.primalCoreBalance);
  }

  get echoFragmentsDeficit(): number {
    return Math.max(0, this.echoFragmentsCost - this.echoFragmentsBalance);
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
          slotKey: slot.slot,
          slotLabel: slot.slotLabel,
          typeLabel: slot.typeLabel,
          rarityLabel: this.formatRarityLabel(rarityKey),
          rarityKey,
          iconImageUrl: slot.iconImageUrl,
          iconGlyph: slot.iconGlyph,
          iconTone: slot.iconTone,
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

  get selectedSpeciesLootGroups(): LootGroup[] {
    const items = this.selectedSpeciesInventoryRows;
    if (items.length === 0) {
      return [];
    }

    const groupedBySlot = new Map<string, InventoryRow[]>();
    for (const item of items) {
      const groupRows = groupedBySlot.get(item.slotKey) ?? [];
      groupRows.push(item);
      groupedBySlot.set(item.slotKey, groupRows);
    }

    return Array.from(groupedBySlot.entries())
      .sort((left, right) => {
        const leftWeight = LOOT_SLOT_ORDER[left[0]] ?? LOOT_SLOT_ORDER["unknown"];
        const rightWeight = LOOT_SLOT_ORDER[right[0]] ?? LOOT_SLOT_ORDER["unknown"];
        return leftWeight - rightWeight;
      })
      .map(([slotKey, rows]) => ({
        slotKey,
        slotLabel: rows[0]?.slotLabel ?? this.formatRarityLabel(slotKey),
        items: [...rows].sort((left, right) => {
          const byRarity = this.resolveRaritySortWeight(right.rarityKey) - this.resolveRaritySortWeight(left.rarityKey);
          if (byRarity !== 0) {
            return byRarity;
          }

          return left.displayName.localeCompare(right.displayName, undefined, { sensitivity: "base" });
        })
      }));
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
      this.actionFeedback = `Salvaged ${item.displayName}: +${salvaged.primalCoreAwarded} Primal Core (${this.toSpeciesLabel(salvaged.speciesId)}).`;
    } catch (error) {
      this.actionFeedback = this.stringifyError(error);
    } finally {
      this.salvagingItemInstanceId = null;
    }
  }

  private async loadBestiary(): Promise<void> {
    await this.accountStore.load();
  }

  private resolveScopedCharacter(contextCharacterId: string | null): CharacterState | null {
    const state = this.accountStore.state();
    if (!state) {
      return null;
    }

    if (contextCharacterId && state.characters[contextCharacterId]) {
      return state.characters[contextCharacterId];
    }

    const activeCharacterId = this.accountStore.activeCharacterId();
    if (activeCharacterId && state.characters[activeCharacterId]) {
      return state.characters[activeCharacterId];
    }

    const sorted = Object.values(state.characters).sort((left, right) => {
      const byName = left.name.localeCompare(right.name, undefined, { sensitivity: "base" });
      return byName !== 0 ? byName : left.characterId.localeCompare(right.characterId);
    });

    return sorted[0] ?? null;
  }

  private buildRows(
    speciesCatalog: ReadonlyArray<BestiarySpecies>,
    character: CharacterState | null,
    thresholds: ReadonlyArray<number>
  ): BestiaryRow[] {
    const killsBySpecies = character?.bestiaryKillsBySpecies ?? {};
    const primalCoreBySpecies = character?.primalCoreBySpecies ?? {};
    const knownRows = speciesCatalog.map((species) =>
      this.buildSpeciesRow(species.speciesId, species.displayName, killsBySpecies, primalCoreBySpecies, thresholds)
    );
    const knownIds = new Set(speciesCatalog.map((species) => species.speciesId));
    const extraIds = Array.from(
      new Set<string>([...Object.keys(killsBySpecies), ...Object.keys(primalCoreBySpecies)])
    )
      .filter((speciesId) => !knownIds.has(speciesId))
      .sort((left, right) => left.localeCompare(right));
    const extraRows = extraIds.map((speciesId) =>
      this.buildSpeciesRow(speciesId, this.toSpeciesLabel(speciesId), killsBySpecies, primalCoreBySpecies, thresholds)
    );

    return [...knownRows, ...extraRows];
  }

  private buildSpeciesRow(
    speciesId: string,
    displayName: string,
    killsBySpecies: Record<string, number>,
    primalCoreBySpecies: Record<string, number>,
    thresholds: ReadonlyArray<number>
  ): BestiaryRow {
    const maxRank = thresholds.length;
    const killsTotal = Math.max(0, killsBySpecies[speciesId] ?? 0);
    const rank = computeRank(killsTotal, thresholds);
    const isMaxRank = rank >= maxRank;
    const nextKillMilestone = isMaxRank ? thresholds[maxRank - 1] : thresholds[rank];
    const currentRankStart = thresholds[rank - 1];
    const bandSize = isMaxRank ? 1 : (nextKillMilestone - currentRankStart);
    const progressInBand = isMaxRank ? 1 : Math.max(0, killsTotal - currentRankStart);
    const progressPercent = Math.min(100, Math.max(0, (progressInBand / bandSize) * 100));

    return {
      speciesId,
      displayName,
      visual: resolveSpeciesVisual({ speciesId, displayName }),
      killsTotal,
      primalCoreBalance: Math.max(0, primalCoreBySpecies[speciesId] ?? 0),
      nextKillMilestone: isMaxRank ? (thresholds[thresholds.length - 1] ?? 100) : nextKillMilestone,
      killsToNextMilestone: isMaxRank ? 0 : Math.max(0, nextKillMilestone - killsTotal),
      progressPercent,
      rank,
      isMaxRank
    };
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

  private resolveRaritySortWeight(rarity: string): number {
    switch (rarity) {
      case "ascendant":
        return 5;
      case "legendary":
        return 4;
      case "epic":
        return 3;
      case "rare":
        return 2;
      case "common":
        return 1;
      default:
        return 0;
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

  private normalizeCharacterId(value: string | null | undefined): string | null {
    const normalized = value?.trim() ?? "";
    return normalized.length > 0 ? normalized : null;
  }

  private clampSpeciesPage(page: number, rowCount: number): number {
    if (rowCount <= 0) {
      return 0;
    }

    const maxPage = Math.max(0, Math.ceil(rowCount / this.speciesPageSize) - 1);
    return Math.min(Math.max(page, 0), maxPage);
  }
}
