import { Component, OnInit } from "@angular/core";
import { RouterLink } from "@angular/router";
import { type CharacterState, type EquipmentDefinition, type ItemDefinition, type SigilInstance } from "../../api/account-api.service";
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

type BackpackInventoryTab = "weapon" | "sigil";
type SigilTierKey = "hollow" | "brave" | "awakened" | "exalted" | "ascendant";

type SigilTierDefinition = Readonly<{
  key: SigilTierKey;
  displayName: string;
  minLevel: number;
  maxLevel: number;
}>;

type SigilTierBucket = Readonly<{
  key: SigilTierKey;
  displayName: string;
  minLevel: number;
  maxLevel: number;
  items: ReadonlyArray<SigilInventoryEntry>;
}>;

type SigilInventoryEntry = Readonly<{
  instanceId: string;
  speciesDisplayName: string;
  tierName: string;
  sigilLevel: number;
  slotIndex: number;
  hpBonus: number;
  isLocked: boolean;
  isEquipped: boolean;
  equippedByLabel: string | null;
}>;

const SIGIL_TIERS: ReadonlyArray<SigilTierDefinition> = [
  { key: "hollow", displayName: "Hollow", minLevel: 1, maxLevel: 20 },
  { key: "brave", displayName: "Brave", minLevel: 21, maxLevel: 40 },
  { key: "awakened", displayName: "Awakened", minLevel: 41, maxLevel: 60 },
  { key: "exalted", displayName: "Exalted", minLevel: 61, maxLevel: 80 },
  { key: "ascendant", displayName: "Ascendant", minLevel: 81, maxLevel: 95 }
];

@Component({
  selector: "app-backpack-page",
  standalone: true,
  imports: [RouterLink, BackpackWindowComponent],
  templateUrl: "./backpack-page.component.html",
  styleUrl: "./backpack-page.component.css"
})
export class BackpackPageComponent implements OnInit {
  equipInFlight = false;
  actionFeedbackMessage = "";
  actionFeedbackIsError = false;
  activeInventoryTab: BackpackInventoryTab = "weapon";
  selectedSigilTierFilter: SigilTierKey | "all" = "all";
  selectedSigilInstanceId: string | null = null;
  sigilCurrentPage = 0;
  readonly sigilPageSize = 5;

  constructor(private readonly accountStore: AccountStore) {}

  async ngOnInit(): Promise<void> {
    try {
      await this.accountStore.load();
      this.ensureSelectedSigil();
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

  get sigilInventory(): ReadonlyArray<SigilInstance> {
    return this.accountStore.state()?.sigilInventory ?? [];
  }

  get sigilEntries(): ReadonlyArray<SigilInventoryEntry> {
    const usageByInstanceId = this.sigilUsageByInstanceId;
    return this.sigilInventory
      .map((sigil) => {
        const usage = usageByInstanceId[sigil.instanceId];
        return {
          instanceId: sigil.instanceId,
          speciesDisplayName: sigil.speciesDisplayName,
          tierName: sigil.tierName,
          sigilLevel: sigil.sigilLevel,
          slotIndex: sigil.slotIndex,
          hpBonus: sigil.hpBonus,
          isLocked: sigil.isLocked === true,
          isEquipped: !!usage,
          equippedByLabel: usage ? `${usage.characterName} - Slot ${usage.slotIndex}` : null
        } satisfies SigilInventoryEntry;
      })
      .sort((left, right) => {
        const byEquipped = Number(right.isEquipped) - Number(left.isEquipped);
        if (byEquipped !== 0) {
          return byEquipped;
        }

        const byLevel = right.sigilLevel - left.sigilLevel;
        if (byLevel !== 0) {
          return byLevel;
        }

        return left.instanceId.localeCompare(right.instanceId, undefined, { sensitivity: "base" });
      });
  }

  get sigilOwnedCount(): number {
    return this.sigilEntries.length;
  }

  get equippedSigilsCount(): number {
    return this.sigilEntries.filter((entry) => entry.isEquipped).length;
  }

  get storedSigilsCount(): number {
    return Math.max(0, this.sigilOwnedCount - this.equippedSigilsCount);
  }

  get sigilTierBuckets(): ReadonlyArray<SigilTierBucket> {
    return SIGIL_TIERS.map((tier) => ({
      key: tier.key,
      displayName: tier.displayName,
      minLevel: tier.minLevel,
      maxLevel: tier.maxLevel,
      items: this.sigilEntries.filter((entry) =>
        entry.sigilLevel >= tier.minLevel && entry.sigilLevel <= tier.maxLevel
      )
    }));
  }

  get filteredSigilEntries(): ReadonlyArray<SigilInventoryEntry> {
    if (this.selectedSigilTierFilter === "all") {
      return this.sigilEntries;
    }

    const tier = SIGIL_TIERS.find((candidate) => candidate.key === this.selectedSigilTierFilter);
    if (!tier) {
      return [];
    }

    return this.sigilEntries.filter((entry) => entry.sigilLevel >= tier.minLevel && entry.sigilLevel <= tier.maxLevel);
  }

  get pagedSigilEntries(): ReadonlyArray<SigilInventoryEntry> {
    const start = this.sigilCurrentPage * this.sigilPageSize;
    return this.filteredSigilEntries.slice(start, start + this.sigilPageSize);
  }

  get sigilPageCount(): number {
    const total = this.filteredSigilEntries.length;
    return total > 0 ? Math.ceil(total / this.sigilPageSize) : 1;
  }

  get sigilPageNumber(): number {
    return this.sigilCurrentPage + 1;
  }

  get visibleSigilTierBuckets(): ReadonlyArray<SigilTierBucket> {
    const buckets = this.selectedSigilTierFilter === "all"
      ? this.sigilTierBuckets
      : this.sigilTierBuckets.filter((tier) => tier.key === this.selectedSigilTierFilter);
    const pagedInstanceIds = new Set(this.pagedSigilEntries.map((entry) => entry.instanceId));

    return buckets
      .map((bucket) => ({
        ...bucket,
        items: bucket.items.filter((entry) => pagedInstanceIds.has(entry.instanceId))
      }))
      .filter((bucket) => bucket.items.length > 0);
  }

  get hasAnySigils(): boolean {
    return this.sigilOwnedCount > 0;
  }

  get visibleSigilCount(): number {
    return this.filteredSigilEntries.length;
  }

  get selectedSigil(): SigilInventoryEntry | null {
    const visibleSigils = this.visibleSigilTierBuckets.flatMap((tier) => tier.items);
    const selected = visibleSigils.find((entry) => entry.instanceId === this.selectedSigilInstanceId) ?? null;
    if (selected) {
      return selected;
    }

    return visibleSigils[0] ?? null;
  }

  get frameEyebrow(): string {
    return this.activeInventoryTab === "weapon" ? "Loadout // Storage" : "Sigils // Storage";
  }

  get frameTitle(): string {
    return this.activeInventoryTab === "weapon" ? "Account Armory" : "Account Sigils";
  }

  get frameSubtitle(): string {
    if (this.activeInventoryTab === "weapon") {
      return "All weapons in your account inventory and who is currently using each one.";
    }

    return "Account-wide Sigil inventory grouped by progression tiers.";
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

  setInventoryTab(tab: BackpackInventoryTab): void {
    this.activeInventoryTab = tab;
    this.sigilCurrentPage = 0;
    if (tab === "sigil") this.ensureSelectedSigil();
  }

  isInventoryTabActive(tab: BackpackInventoryTab): boolean {
    return this.activeInventoryTab === tab;
  }

  setSigilTierFilter(filter: SigilTierKey | "all"): void {
    this.selectedSigilTierFilter = filter;
    this.sigilCurrentPage = 0;
    this.ensureSelectedSigil();
  }

  isSigilTierFilterActive(filter: SigilTierKey | "all"): boolean {
    return this.selectedSigilTierFilter === filter;
  }

  selectSigil(instanceId: string): void {
    this.selectedSigilInstanceId = instanceId;
  }

  prevSigilPage(): void {
    if (this.sigilCurrentPage <= 0) {
      return;
    }

    this.sigilCurrentPage -= 1;
    this.ensureSelectedSigil();
  }

  nextSigilPage(): void {
    if (this.sigilCurrentPage >= this.sigilPageCount - 1) {
      return;
    }

    this.sigilCurrentPage += 1;
    this.ensureSelectedSigil();
  }

  trackSigilByInstanceId(_index: number, sigil: SigilInventoryEntry): string {
    return sigil.instanceId;
  }

  trackTierByKey(_index: number, tier: SigilTierBucket): string {
    return tier.key;
  }

  get sigilTierDefinitions(): ReadonlyArray<SigilTierDefinition> {
    return SIGIL_TIERS;
  }

  formatSigilLevelRange(minLevel: number, maxLevel: number): string {
    return `Lv ${minLevel}-${maxLevel}`;
  }

  private ensureSelectedSigil(): void {
    this.sigilCurrentPage = this.clampSigilPage(this.sigilCurrentPage);
    const visibleSigils = this.visibleSigilTierBuckets.flatMap((tier) => tier.items);
    if (visibleSigils.length === 0) {
      this.selectedSigilInstanceId = null;
      return;
    }

    if (!this.selectedSigilInstanceId || !visibleSigils.some((entry) => entry.instanceId === this.selectedSigilInstanceId)) {
      this.selectedSigilInstanceId = visibleSigils[0].instanceId;
    }
  }

  private clampSigilPage(value: number): number {
    const maxPage = Math.max(0, this.sigilPageCount - 1);
    return Math.min(Math.max(0, value), maxPage);
  }

  private get sigilUsageByInstanceId(): Readonly<Record<string, {
    characterName: string;
    slotIndex: number;
  }>> {
    const usageByInstanceId: Record<string, { characterName: string; slotIndex: number }> = {};
    const state = this.accountStore.state();
    if (!state) {
      return usageByInstanceId;
    }

    for (const character of Object.values(state.characters)) {
      const characterName = resolveCharacterDisplayName({
        characterId: character.characterId,
        preferredName: character.name
      });

      const slots = [
        character.sigilLoadout.slot1,
        character.sigilLoadout.slot2,
        character.sigilLoadout.slot3,
        character.sigilLoadout.slot4,
        character.sigilLoadout.slot5
      ];

      for (let index = 0; index < slots.length; index += 1) {
        const sigil = slots[index];
        if (!sigil?.instanceId) {
          continue;
        }

        usageByInstanceId[sigil.instanceId] = {
          characterName,
          slotIndex: index + 1
        };
      }
    }

    return usageByInstanceId;
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
