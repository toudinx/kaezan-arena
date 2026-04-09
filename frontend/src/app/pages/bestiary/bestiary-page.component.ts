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

type BestiaryCategory = "common" | "elite" | "boss";
type BestiaryTab = BestiaryCategory;

type BestiarySection = Readonly<{
  key: BestiaryCategory;
  label: string;
  rows: BestiaryRow[];
  emptyMessage: string;
}>;

type BestiaryRow = Readonly<{
  speciesId: string;
  displayName: string;
  category: BestiaryCategory;
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
  definitionId: string;
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
  craftedByCharacterId: string | null;
  craftedByCharacterName: string | null;
  isEquipped: boolean;
  canRefine: boolean;
  canAffordRefine: boolean;
  nextRarityLabel: string | null;
  refinePrimalCoreCost: number | null;
  refineEchoFragmentsCost: number | null;
  speciesPrimalCoreBalance: number;
  refinePrimalCoreDeficit: number;
  refineEchoFragmentsDeficit: number;
}>;

type RefineRule = Readonly<{
  nextRarity: string;
  primalCoreCost: number;
  echoFragmentsCost: number;
}>;

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

const SPECIES_CATEGORY_ORDER: Record<BestiaryCategory, number> = {
  common: 0,
  elite: 1,
  boss: 2
};
const SECTION_PAGE_SIZE: Readonly<Record<BestiaryCategory, number>> = {
  common: 5,
  elite: 5,
  boss: 5
};

@Component({
  selector: "app-bestiary-page",
  standalone: true,
  templateUrl: "./bestiary-page.component.html",
  styleUrl: "./bestiary-page.component.css"
})
export class BestiaryPageComponent implements OnInit {
  readonly primalCoreCost = 20;
  readonly echoFragmentsCost = 100;
  readonly activeTab = signal<BestiaryTab>("common");
  readonly commonPage = signal(1);
  readonly elitePage = signal(1);
  readonly bossPage = signal(1);
  private readonly contextCharacterIdSignal = signal<string | null>(null);
  private readonly selectedSpeciesIdSignal = signal<string | null>(null);
  private readonly searchQuerySignal = signal("");
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
      const byCategory = SPECIES_CATEGORY_ORDER[a.category] - SPECIES_CATEGORY_ORDER[b.category];
      if (byCategory !== 0) return byCategory;

      const aHasKills = a.killsTotal > 0 ? 1 : 0;
      const bHasKills = b.killsTotal > 0 ? 1 : 0;
      if (aHasKills !== bHasKills) return bHasKills - aHasKills;
      if (aHasKills === 1 && a.killsTotal !== b.killsTotal) return b.killsTotal - a.killsTotal;
      if (a.killsTotal !== b.killsTotal) return b.killsTotal - a.killsTotal;
      return a.displayName.localeCompare(b.displayName);
    });
  });
  isCrafting = false;
  refiningItemInstanceId: string | null = null;
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
  private readonly maintainSectionPagesEffect = effect(() => {
    this.clampSectionPage("common");
    this.clampSectionPage("elite");
    this.clampSectionPage("boss");
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

  get commonSpeciesRows(): BestiaryRow[] {
    return this.filteredSpeciesRows.filter((row) => row.category === "common");
  }

  get eliteSpeciesRows(): BestiaryRow[] {
    return this.filteredSpeciesRows.filter((row) => row.category === "elite");
  }

  get bossSpeciesRows(): BestiaryRow[] {
    return this.filteredSpeciesRows.filter((row) => row.category === "boss");
  }

  get speciesSections(): ReadonlyArray<BestiarySection> {
    return [
      {
        key: "common",
        label: "Common",
        rows: this.commonSpeciesRows,
        emptyMessage: "No common species match your search."
      },
      {
        key: "elite",
        label: "Elite Commanders",
        rows: this.eliteSpeciesRows,
        emptyMessage: "No elite commanders match your search."
      },
      {
        key: "boss",
        label: "Bosses",
        rows: this.bossSpeciesRows,
        emptyMessage: "No bosses match your search."
      }
    ];
  }

  get commonSpeciesTotal(): number {
    return this.speciesRows.filter((row) => row.category === "common").length;
  }

  get eliteSpeciesTotal(): number {
    return this.speciesRows.filter((row) => row.category === "elite").length;
  }

  get bossSpeciesTotal(): number {
    return this.speciesRows.filter((row) => row.category === "boss").length;
  }

  get activeSpeciesSection(): BestiarySection | null {
    return this.speciesSections.find((section) => section.key === this.activeTab()) ?? null;
  }

  getSectionPageCount(category: BestiaryCategory): number {
    const rows = this.getSectionRows(category);
    const pageSize = SECTION_PAGE_SIZE[category];
    if (rows.length === 0) {
      return 0;
    }

    return Math.ceil(rows.length / pageSize);
  }

  getSectionIsPageStart(category: BestiaryCategory): boolean {
    return this.getSectionPage(category) <= 1;
  }

  getSectionIsPageEnd(category: BestiaryCategory): boolean {
    const pageCount = this.getSectionPageCount(category);
    return pageCount === 0 || this.getSectionPage(category) >= pageCount;
  }

  getSectionPageWindowLabel(category: BestiaryCategory): string {
    const rows = this.getSectionRows(category);
    const total = rows.length;
    const pageSize = SECTION_PAGE_SIZE[category];
    if (total === 0) {
      return "0 / 0";
    }

    const start = (this.getSectionPage(category) - 1) * pageSize + 1;
    const end = Math.min(total, start + pageSize - 1);
    return `${start}-${end} / ${total}`;
  }

  getPagedSectionRows(category: BestiaryCategory): BestiaryRow[] {
    const rows = this.getSectionRows(category);
    const pageSize = SECTION_PAGE_SIZE[category];
    const currentPage = this.getSectionPage(category);
    const start = Math.max(0, (currentPage - 1) * pageSize);
    return rows.slice(start, start + pageSize);
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

  setTab(tab: BestiaryTab): void {
    if (this.activeTab() === tab) {
      return;
    }

    this.activeTab.set(tab);
    const tabRows = this.getSectionRows(tab);
    const selectedSpeciesId = this.selectedSpeciesIdSignal();
    if (tabRows.length > 0 && !tabRows.some((row) => row.speciesId === selectedSpeciesId)) {
      this.selectedSpeciesIdSignal.set(tabRows[0].speciesId);
    }
  }

  onSearchInput(event: Event): void {
    const input = event.target;
    this.searchQuerySignal.set(input instanceof HTMLInputElement ? input.value : "");
    this.commonPage.set(1);
    this.elitePage.set(1);
    this.bossPage.set(1);
  }

  goToPreviousSectionPage(category: BestiaryCategory): void {
    const pageSignal = this.getSectionPageSignal(category);
    pageSignal.update((page) => Math.max(1, page - 1));
  }

  goToNextSectionPage(category: BestiaryCategory): void {
    const pageSignal = this.getSectionPageSignal(category);
    const maxPage = Math.max(1, this.getSectionPageCount(category));
    pageSignal.update((page) => Math.min(maxPage, page + 1));
  }

  get canCraftSelectedSpecies(): boolean {
    const selected = this.selectedSpecies;
    if (!selected) {
      return false;
    }

    return !this.hasSelectedSpeciesCraftHistory &&
      selected.primalCoreBalance >= this.primalCoreCost &&
      this.echoFragmentsBalance >= this.echoFragmentsCost;
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
        const refinePrimalCoreDeficit =
          canRefine && refineRule
            ? Math.max(0, refineRule.primalCoreCost - speciesPrimalCore)
            : 0;
        const refineEchoFragmentsDeficit =
          canRefine && refineRule
            ? Math.max(0, refineRule.echoFragmentsCost - this.echoFragmentsBalance)
            : 0;
        return {
          instanceId: slot.instanceId,
          definitionId: slot.definitionId,
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
          craftedByCharacterId: slot.craftedByCharacterId,
          craftedByCharacterName: slot.craftedByCharacterName,
          isEquipped: slot.isEquipped,
          canRefine,
          canAffordRefine,
          nextRarityLabel: refineRule ? this.formatRarityLabel(refineRule.nextRarity) : null,
          refinePrimalCoreCost: refineRule?.primalCoreCost ?? null,
          refineEchoFragmentsCost: refineRule?.echoFragmentsCost ?? null,
          speciesPrimalCoreBalance: speciesPrimalCore,
          refinePrimalCoreDeficit,
          refineEchoFragmentsDeficit
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

  get hasSelectedSpeciesCraftHistory(): boolean {
    const selected = this.selectedSpecies;
    const state = this.accountStore.state();
    const character = this.activeCharacter;
    if (!selected || !state || !character) {
      return false;
    }

    const selectedSpeciesId = selected.speciesId;
    const selectedCharacterId = character.characterId;
    for (const accountCharacter of Object.values(state.characters)) {
      for (const instance of Object.values(accountCharacter.inventory.equipmentInstances)) {
        const slot = (instance.slot ?? "").trim().toLowerCase();
        const isWeaponSlot = slot.length === 0 || slot === "weapon";
        if (!isWeaponSlot) {
          continue;
        }

        if (
          instance.originSpeciesId === selectedSpeciesId &&
          instance.craftedByCharacterId === selectedCharacterId
        ) {
          return true;
        }
      }
    }

    // Legacy fallback for old instances without crafted-by metadata.
    return Object.values(character.inventory.equipmentInstances).some((instance) =>
      instance.definitionId === "wpn.primal_forged_blade" &&
      instance.originSpeciesId === selectedSpeciesId &&
      ((instance.slot ?? "").trim().length === 0 || (instance.slot ?? "").trim().toLowerCase() === "weapon")
    );
  }

  get selectedSpeciesRefineWeaponRows(): InventoryRow[] {
    return [...this.selectedSpeciesInventoryRows]
      .filter((item) => this.canCurrentCharacterUseForgedWeapon(item))
      .sort((left, right) => {
      const byRarity = this.resolveRaritySortWeight(right.rarityKey) - this.resolveRaritySortWeight(left.rarityKey);
      if (byRarity !== 0) {
        return byRarity;
      }

      if (left.isEquipped !== right.isEquipped) {
        return left.isEquipped ? -1 : 1;
      }

      const byInstanceId = left.instanceId.localeCompare(right.instanceId, undefined, { sensitivity: "base" });
      if (byInstanceId !== 0) {
        return byInstanceId;
      }

      return left.displayName.localeCompare(right.displayName, undefined, { sensitivity: "base" });
    });
  }

  get selectedSpeciesRefineWeapon(): InventoryRow | null {
    return this.selectedSpeciesRefineWeaponRows[0] ?? null;
  }

  get selectedSpeciesForeignForgedCount(): number {
    return this.selectedSpeciesInventoryRows.filter((item) => !this.canCurrentCharacterUseForgedWeapon(item)).length;
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
      const crafted = await this.accountStore.craftBestiaryItem(selected.speciesId, slot, this.characterId);
      this.lastUpdatedItemInstanceId = crafted.craftedItem.instanceId;
      const craftedLabel = this.accountStore.catalogs().itemById[crafted.craftedItem.definitionId]?.displayName ??
        crafted.craftedItem.definitionId;
      const forgedBy = crafted.craftedItem.craftedByCharacterName?.trim() || this.characterName || "Unknown Kaelis";
      this.actionFeedback = `Crafted ${craftedLabel} from ${selected.displayName}. Forged by ${forgedBy}.`;
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
      const refined = await this.accountStore.refineItem(item.instanceId, this.characterId);
      this.lastUpdatedItemInstanceId = refined.refinedItem.instanceId;
      this.actionFeedback = `Refined ${item.displayName} to ${this.formatRarityLabel(this.normalizeRarity(refined.refinedItem.rarity) ?? "unknown")}.`;
    } catch (error) {
      this.actionFeedback = this.stringifyError(error);
    } finally {
      this.refiningItemInstanceId = null;
    }
  }

  getRefineLoreLabel(item: InventoryRow): string | null {
    const craftedBy = item.craftedByCharacterName?.trim() ?? "";
    if (craftedBy.length > 0) {
      return `Forged by ${craftedBy}`;
    }

    return item.definitionId === "wpn.primal_forged_blade"
      ? "Forged by an unknown Kaelis"
      : null;
  }

  private canCurrentCharacterUseForgedWeapon(item: InventoryRow): boolean {
    const ownerId = item.craftedByCharacterId?.trim() ?? "";
    if (ownerId.length === 0) {
      return true;
    }

    return ownerId === this.characterId;
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
      this.buildSpeciesRow(
        species.speciesId,
        species.displayName,
        this.normalizeSpeciesCategory(species.category),
        killsBySpecies,
        primalCoreBySpecies,
        thresholds
      )
    );

    return knownRows;
  }

  private buildSpeciesRow(
    speciesId: string,
    displayName: string,
    category: BestiaryCategory,
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
      category,
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

  private normalizeSpeciesCategory(category: string | null | undefined): BestiaryCategory {
    const normalized = category?.trim().toLowerCase();
    if (normalized === "elite" || normalized === "boss") {
      return normalized;
    }

    return "common";
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

  private getSectionRows(category: BestiaryCategory): BestiaryRow[] {
    switch (category) {
      case "common":
        return this.commonSpeciesRows;
      case "elite":
        return this.eliteSpeciesRows;
      case "boss":
        return this.bossSpeciesRows;
      default:
        return [];
    }
  }

  private getSectionPage(category: BestiaryCategory): number {
    return this.getSectionPageSignal(category)();
  }

  private getSectionPageSignal(category: BestiaryCategory) {
    switch (category) {
      case "common":
        return this.commonPage;
      case "elite":
        return this.elitePage;
      case "boss":
        return this.bossPage;
      default:
        return this.commonPage;
    }
  }

  private clampSectionPage(category: BestiaryCategory): void {
    const pageSignal = this.getSectionPageSignal(category);
    const currentPage = pageSignal();
    const rowCount = this.getSectionRows(category).length;
    if (rowCount <= 0) {
      if (currentPage !== 1) {
        pageSignal.set(1);
      }
      return;
    }

    const pageSize = SECTION_PAGE_SIZE[category];
    const maxPage = Math.max(1, Math.ceil(rowCount / pageSize));
    const clamped = Math.min(Math.max(currentPage, 1), maxPage);
    if (clamped !== currentPage) {
      pageSignal.set(clamped);
    }
  }
}
