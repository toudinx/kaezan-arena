import { Component, OnInit, signal } from "@angular/core";
import { Router } from "@angular/router";
import { AccountStore } from "../../account/account-store.service";
import {
  resolveCharacterDisplayName,
  resolveCharacterPortraitVisual
} from "../../shared/characters/character-visuals.helpers";
import { resolveItemVisual } from "../../shared/items/item-visuals.helpers";
import {
  KaelisRosterStripComponent,
  type RosterEntry
} from "./components/roster-strip/roster-strip.component";
import {
  KaelisSideNavigationComponent,
  type KaelisTab
} from "./components/side-navigation/side-navigation.component";
import { KaelisCenterPreviewComponent } from "./components/center-preview/center-preview.component";
import {
  KaelisInfoPanelComponent,
  type InfoPanelStat,
  type WeaponInfo
} from "./components/info-panel/info-panel.component";
import {
  KaelisSelectionModalComponent,
  type SelectionModalMode,
  type SelectionItem,
  type SigilSelectionContext
} from "./components/selection-modal/selection-modal.component";
import { BestiaryPageComponent } from "../bestiary/bestiary-page.component";
import type {
  CharacterSigilLoadoutStateResponse,
  CharacterState,
  EquipmentDefinition,
  ItemDefinition,
  OwnedEquipmentInstance,
  SigilInstance,
  SigilLoadoutMutationResponse,
  SigilSlotState
} from "../../api/account-api.service";
import type { SigilSlotCardViewModel } from "./components/sigil-pentagon/sigil-pentagon.component";

@Component({
  selector: "app-characters-page",
  standalone: true,
  imports: [
    KaelisRosterStripComponent,
    KaelisSideNavigationComponent,
    KaelisCenterPreviewComponent,
    KaelisInfoPanelComponent,
    KaelisSelectionModalComponent,
    BestiaryPageComponent
  ],
  templateUrl: "./characters-page.component.html",
  styleUrl: "./characters-page.component.css"
})
export class CharactersPageComponent implements OnInit {
  activeTab = signal<KaelisTab>('overview');
  selectedCharacterId = signal<string | null>(null);
  modalOpen = signal(false);
  modalMode = signal<SelectionModalMode>('weapon');
  modalSelectedId = signal<string | null>(null);
  selectedSigilSlotIndex = signal<number | null>(null);
  sigilInventory = signal<SigilInstance[]>([]);
  sigilLoadoutState = signal<CharacterSigilLoadoutStateResponse | null>(null);
  sigilActionError = signal<string | null>(null);
  sigilBusySlotIndex = signal<number | null>(null);

  constructor(
    private readonly accountStore: AccountStore,
    private readonly router: Router
  ) {}

  async ngOnInit(): Promise<void> {
    try {
      await this.accountStore.load();
    } catch {
      // Render uses store error state.
    }

    const charactersMap = this.accountStore.state()?.characters ?? {};
    const characters = Object.values(charactersMap);
    if (characters.length > 0 && !this.selectedCharacterId()) {
      const activeId = this.accountStore.state()?.activeCharacterId;
      this.selectedCharacterId.set(activeId ?? characters[0].characterId);
    }

    const selectedCharacterId = this.selectedCharacterId();
    if (selectedCharacterId) {
      await this.loadSigilState(selectedCharacterId);
    }
  }

  get rosterEntries(): RosterEntry[] {
    const charactersMap = this.accountStore.state()?.characters ?? {};
    return Object.values(charactersMap).map(c => {
      const catalog = this.accountStore.catalogs().characterById[c.characterId];
      const portrait = resolveCharacterPortraitVisual({
        characterId: c.characterId,
        displayName: catalog?.displayName ?? c.name,
        context: "roster"
      });
      return {
        id: c.characterId,
        name: resolveCharacterDisplayName({
          characterId: c.characterId,
          preferredName: catalog?.displayName ?? c.name
        }),
        imageUrl: portrait.imageUrl,
        portrait: { imageUrl: portrait.imageUrl, monogram: portrait.monogram, tone: portrait.tone },
        kitBadge: catalog?.subtitle ?? "Kit [WIP]",
        masteryLevel: Math.max(1, c.masteryLevel ?? 1)
      };
    });
  }

  get activeCharacter(): CharacterState | null {
    const id = this.selectedCharacterId();
    if (!id) return null;
    return this.accountStore.state()?.characters[id] ?? null;
  }

  private get activeWeaponContext(): Readonly<{
    instance: OwnedEquipmentInstance;
    equipmentDefinition: EquipmentDefinition | null;
    itemDefinition: ItemDefinition | null;
    rarity: string;
  }> | null {
    const char = this.activeCharacter;
    if (!char) return null;

    const instanceId = char.equipment.weaponInstanceId;
    if (!instanceId) return null;

    const instance = char.inventory.equipmentInstances[instanceId];
    if (!instance) return null;

    const equipmentDefinition = this.accountStore.catalogs().equipmentById[instance.definitionId] ?? null;
    const itemDefinition = this.accountStore.catalogs().itemById[instance.definitionId] ?? null;
    const rarity = this.normalizeRarity(instance.rarity, itemDefinition?.rarity);

    return {
      instance,
      equipmentDefinition,
      itemDefinition,
      rarity
    };
  }

  get activeCharacterName(): string {
    const char = this.activeCharacter;
    if (!char) return '';
    const catalog = this.accountStore.catalogs().characterById[char.characterId];
    return resolveCharacterDisplayName({
      characterId: char.characterId,
      preferredName: catalog?.displayName ?? char.name ?? ''
    });
  }

  get activeCharacterSubtitle(): string {
    const char = this.activeCharacter;
    if (!char) return '';
    return this.accountStore.catalogs().characterById[char.characterId]?.subtitle ?? '';
  }

  get activeCharacterFixedKit(): string[] {
    const char = this.activeCharacter;
    if (!char) {
      return [];
    }

    return this.accountStore.catalogs().characterById[char.characterId]?.fixedWeaponNames ?? [];
  }

  get isSelectedCharacterActive(): boolean {
    const selectedCharacterId = this.selectedCharacterId();
    if (!selectedCharacterId) {
      return false;
    }

    return this.accountStore.state()?.activeCharacterId === selectedCharacterId;
  }

  get activeCharacterImageUrl(): string | null {
    const char = this.activeCharacter;
    if (!char) return null;
    const portrait = resolveCharacterPortraitVisual({
      characterId: char.characterId,
      displayName: this.activeCharacterName,
      context: "kaelis"
    });
    return portrait.imageUrl ?? null;
  }

  get activeWeaponImageUrl(): string | null {
    const context = this.activeWeaponContext;
    if (!context) return null;

    const visual = resolveItemVisual({
      slot: context.equipmentDefinition?.slot ?? "weapon",
      weaponClass: context.equipmentDefinition?.weaponClass ?? null,
      displayName: context.itemDefinition?.displayName ?? context.instance.definitionId,
      definitionId: context.instance.definitionId
    });

    return visual.iconImageUrl;
  }

  get masteryLevel(): number {
    return Math.max(1, this.activeCharacter?.masteryLevel ?? 1);
  }

  get masteryXp(): number {
    return Math.max(0, Math.floor(this.activeCharacter?.masteryXpForCurrentLevel ?? 0));
  }

  get masteryXpRequired(): number {
    return Math.max(1, Math.floor(this.activeCharacter?.masteryXpRequiredForNextLevel ?? 100));
  }

  get baseStats(): InfoPanelStat[] {
    // Use mastery stats — real data from API
    return [
      { label: 'Mastery', value: `${this.masteryLevel}` },
      { label: 'Mastery XP', value: `${this.masteryXp} / ${this.masteryXpRequired}` },
      { label: 'Sigil Slots', value: `${Math.min(5, this.activeCharacter?.unlockedSigilSlots ?? 0)}` }
    ];
  }

  get equippedWeaponName(): string {
    const char = this.activeCharacter;
    if (!char) return 'None';
    const instanceId = char.equipment.weaponInstanceId;
    if (!instanceId) return 'None';
    const instance = char.inventory.equipmentInstances[instanceId];
    if (!instance) return 'Unknown';
    return this.accountStore.catalogs().itemById[instance.definitionId]?.displayName ?? instance.definitionId;
  }

  get weaponInfo(): WeaponInfo | null {
    const context = this.activeWeaponContext;
    if (!context) return null;

    const weaponClass = toTitleLabel(context.equipmentDefinition?.weaponClass ?? "");
    const weaponElement = toTitleLabel(context.equipmentDefinition?.weaponElement ?? "");
    const rarityLabel = toTitleLabel(context.rarity);
    const summaryParts = [
      weaponClass || "Weapon",
      weaponElement ? `(${weaponElement})` : "",
      rarityLabel ? `- ${rarityLabel}` : ""
    ].filter((part) => part.length > 0);

    const passive = this.resolvePrimaryWeaponPassive(context.equipmentDefinition?.gameplayModifiers ?? {});

    return {
      name: context.itemDefinition?.displayName ?? context.instance.definitionId,
      description: summaryParts.join(" "),
      passive,
      imageUrl: this.activeWeaponImageUrl
    };
  }

  get weaponStats(): InfoPanelStat[] {
    const context = this.activeWeaponContext;
    if (!context) return [];

    const modifiers = context.equipmentDefinition?.gameplayModifiers ?? {};
    const stats: InfoPanelStat[] = [];

    stats.push({ label: "Rarity", value: toTitleLabel(context.rarity) });

    if (context.equipmentDefinition?.weaponClass) {
      stats.push({ label: "Class", value: toTitleLabel(context.equipmentDefinition.weaponClass) });
    }

    if (context.equipmentDefinition?.weaponElement) {
      stats.push({ label: "Element", value: toTitleLabel(context.equipmentDefinition.weaponElement) });
    }

    const attack = readNumericModifier(modifiers, "stat.attack");
    if (attack !== null) {
      stats.push({ label: "Damage", value: formatSignedNumber(attack) });
    }

    const defense = readNumericModifier(modifiers, "stat.defense");
    if (defense !== null) {
      stats.push({ label: "Defense", value: formatSignedNumber(defense) });
    }

    const vitality = readNumericModifier(modifiers, "stat.vitality");
    if (vitality !== null) {
      stats.push({ label: "Vitality", value: formatSignedNumber(vitality) });
    }

    for (const [key, value] of Object.entries(modifiers)) {
      if (key.startsWith("stat.") || !value || value.trim().length === 0) {
        continue;
      }

      stats.push({
        label: formatModifierLabel(key),
        value: toTitleLabel(value)
      });
    }

    return stats;
  }

  readonly sigilStats: InfoPanelStat[] = [];
  readonly sigilSetBonuses: never[] = [];

  get sigilSlotCards(): SigilSlotCardViewModel[] {
    const loadoutState = this.sigilLoadoutState();
    const activeCharacter = this.activeCharacter;
    const slots = loadoutState?.slots ?? buildFallbackSigilSlots(activeCharacter);

    return slots
      .slice()
      .sort((left, right) => left.slotIndex - right.slotIndex)
      .map((slot) => {
        const ascendantProgress = activeCharacter?.ascendantProgress?.find(
          (entry) => entry.tierIndex === slot.slotIndex - 1
        );
        const ascendantProgressLabel = ascendantProgress
          ? ascendantProgress.isUnlocked
            ? "Unlocked"
            : `${ascendantProgress.speciesAtMaxRank}/${ascendantProgress.speciesRequired} species`
          : slot.isAscendantUnlocked
            ? "Unlocked"
            : "Locked";

        return {
          slotIndex: slot.slotIndex,
          tierName: slot.tierName,
          isUnlockedByMastery: slot.isUnlockedByMastery,
          isPrerequisiteSatisfied: slot.isPrerequisiteSatisfied,
          isAscendantUnlocked: slot.isAscendantUnlocked,
          canEquipNow: slot.canEquipNow,
          lockReason: slot.lockReason ?? null,
          ascendantProgressLabel,
          equippedSigil: slot.equippedSigil
            ? {
                instanceId: slot.equippedSigil.instanceId,
                speciesDisplayName: slot.equippedSigil.speciesDisplayName,
                sigilLevel: slot.equippedSigil.sigilLevel,
                hpBonus: slot.equippedSigil.hpBonus
              }
            : null,
          canUnequip: this.canUnequipSlot(slot.slotIndex)
        };
      });
  }

  get availableWeaponItems(): SelectionItem[] {
    return Object.entries(this.accountStore.catalogs().equipmentById)
      .map(([id, item]) => ({
        id,
        name: this.accountStore.catalogs().itemById[id]?.displayName ?? id,
        description: '',
        flatStatLabel: item.slot,
        secondaryStatLabel: item.weaponClass
      }));
  }

  get availableSigilItems(): SelectionItem[] {
    const selectedSlotIndex = this.selectedSigilSlotIndex();
    const selectedCharacterId = this.selectedCharacterId();
    const usageByInstanceId = this.buildSigilUsageByInstanceId();

    return this.sigilInventory()
      .slice()
      .sort((left, right) => {
        if (left.sigilLevel !== right.sigilLevel) {
          return right.sigilLevel - left.sigilLevel;
        }

        return left.instanceId.localeCompare(right.instanceId);
      })
      .map((sigil) => {
        const usage = usageByInstanceId[sigil.instanceId];
        const isEquipped = !!usage;
        const isCurrentSlotEquipped = isEquipped
          && usage.characterId === selectedCharacterId
          && usage.slotIndex === selectedSlotIndex;
        const isCompatible = selectedSlotIndex ? sigil.slotIndex === selectedSlotIndex : true;
        const isSelectable = !sigil.isLocked && isCompatible && (!isEquipped || isCurrentSlotEquipped);
        const equippedByLabel = usage
          ? `${usage.characterName} - Slot ${usage.slotIndex}`
          : undefined;

        let unavailableReason: string | undefined;
        if (sigil.isLocked) {
          unavailableReason = "Sigil is locked in account inventory.";
        } else if (!isCompatible && selectedSlotIndex) {
          unavailableReason = `Requires Slot ${sigil.slotIndex} (${sigil.tierName}).`;
        } else if (isEquipped && !isCurrentSlotEquipped) {
          unavailableReason = "Already equipped on another loadout slot.";
        }

        return {
          id: sigil.instanceId,
          name: sigil.speciesDisplayName,
          description: `${sigil.tierName} tier - Lv.${sigil.sigilLevel}`,
          setKey: sigil.definitionId ?? sigil.speciesId,
          setName: sigil.speciesDisplayName,
          mainStatLabel: "HP Bonus",
          mainStatValue: `+${sigil.hpBonus}`,
          subStats: [
            { label: "Tier", value: sigil.tierName },
            { label: "Slot", value: `${sigil.slotIndex}` }
          ],
          tierId: sigil.tierId,
          tierName: sigil.tierName,
          sigilSlotIndex: sigil.slotIndex,
          sigilLevel: sigil.sigilLevel,
          hpBonus: sigil.hpBonus,
          isEquipped,
          equippedByLabel,
          isCompatible,
          isSelectable,
          unavailableReason
        } satisfies SelectionItem;
      });
  }

  get modalItems(): SelectionItem[] {
    return this.modalMode() === "sigil"
      ? this.availableSigilItems
      : this.availableWeaponItems;
  }

  get sigilModalContext(): SigilSelectionContext | null {
    if (this.modalMode() !== "sigil") {
      return null;
    }

    const slotIndex = this.selectedSigilSlotIndex();
    if (!slotIndex) {
      return null;
    }

    const slotState = this.findSigilSlotState(slotIndex);
    return {
      slotIndex,
      slotTierName: slotState?.tierName ?? `Slot ${slotIndex}`,
      isSlotUsable: slotState?.canEquipNow ?? true,
      lockReason: slotState?.lockReason ?? null,
      currentEquippedInstanceId: slotState?.equippedSigil?.instanceId ?? null
    };
  }

  get activeTabLabel(): string {
    const tab = this.activeTab();
    if (tab === "overview") {
      return "OVERVIEW";
    }

    if (tab === "weapon") {
      return "WEAPON";
    }

    if (tab === "sigils") {
      return "SIGILS";
    }

    return "BESTIARY";
  }

  setActiveTab(tab: KaelisTab): void {
    this.activeTab.set(tab);
    if (tab === "sigils") {
      const characterId = this.selectedCharacterId();
      if (characterId) {
        void this.loadSigilState(characterId);
      }
    }
  }

  selectEntry(id: string): void {
    this.selectedCharacterId.set(id);
    void this.loadSigilState(id);
  }

  previousEntry(): void {
    const entries = this.rosterEntries;
    if (!entries.length) return;
    const idx = entries.findIndex(e => e.id === this.selectedCharacterId());
    const prev = idx <= 0 ? entries.length - 1 : idx - 1;
    this.selectEntry(entries[prev].id);
  }

  nextEntry(): void {
    const entries = this.rosterEntries;
    if (!entries.length) return;
    const idx = entries.findIndex(e => e.id === this.selectedCharacterId());
    const next = idx < 0 || idx >= entries.length - 1 ? 0 : idx + 1;
    this.selectEntry(entries[next].id);
  }

  async openWeaponModal(): Promise<void> {
    const activeCharacterId = this.selectedCharacterId();
    if (activeCharacterId) {
      try {
        await this.accountStore.setActiveCharacter(activeCharacterId);
      } catch {
        // Navigation should still proceed even if active-character sync fails.
      }
    }

    void this.router.navigateByUrl("/backpack");
  }

  openSigilModal(slotIndex: number): void {
    const slot = this.sigilSlotCards.find((candidate) => candidate.slotIndex === slotIndex);
    if (!slot || !slot.canEquipNow) {
      return;
    }

    this.selectedSigilSlotIndex.set(slotIndex);
    this.modalMode.set('sigil');
    this.modalSelectedId.set(slot.equippedSigil?.instanceId ?? null);
    this.modalOpen.set(true);
  }

  closeModal(): void {
    this.modalOpen.set(false);
    this.selectedSigilSlotIndex.set(null);
    this.modalSelectedId.set(null);
  }

  async confirmSelection(id: string | null): Promise<void> {
    if (this.modalMode() !== "sigil") {
      this.modalOpen.set(false);
      return;
    }

    const slotIndex = this.selectedSigilSlotIndex();
    const characterId = this.selectedCharacterId();
    if (!slotIndex || !characterId) {
      this.modalOpen.set(false);
      return;
    }

    const currentEquippedId = this.findSigilSlotState(slotIndex)?.equippedSigil?.instanceId ?? null;
    if ((id ?? null) === currentEquippedId || (!id && !currentEquippedId)) {
      this.modalOpen.set(false);
      this.selectedSigilSlotIndex.set(null);
      this.modalSelectedId.set(null);
      return;
    }

    if (id) {
      const selectedItem = this.availableSigilItems.find((item) => item.id === id) ?? null;
      if (selectedItem?.isSelectable === false) {
        this.sigilActionError.set(selectedItem.unavailableReason ?? "Selected Sigil cannot be equipped in this slot.");
        return;
      }
    }

    this.sigilBusySlotIndex.set(slotIndex);
    this.sigilActionError.set(null);
    try {
      const mutation = id
        ? await this.accountStore.equipSigilToSlot(characterId, slotIndex, id)
        : await this.accountStore.unequipSigilFromSlot(characterId, slotIndex);
      this.applySigilMutationState(mutation);
      this.modalOpen.set(false);
      this.selectedSigilSlotIndex.set(null);
      this.modalSelectedId.set(null);
    } catch (error) {
      this.sigilActionError.set(this.stringifyError(error));
    } finally {
      this.sigilBusySlotIndex.set(null);
    }
  }

  async unequipSigilFromSlot(slotIndex: number): Promise<void> {
    const characterId = this.selectedCharacterId();
    if (!characterId || !this.canUnequipSlot(slotIndex)) {
      return;
    }

    this.sigilBusySlotIndex.set(slotIndex);
    this.sigilActionError.set(null);
    try {
      const mutation = await this.accountStore.unequipSigilFromSlot(characterId, slotIndex);
      this.applySigilMutationState(mutation);
    } catch (error) {
      this.sigilActionError.set(this.stringifyError(error));
    } finally {
      this.sigilBusySlotIndex.set(null);
    }
  }

  async setSelectedCharacterAsActive(): Promise<void> {
    const characterId = this.selectedCharacterId();
    if (!characterId || this.isSelectedCharacterActive) {
      return;
    }

    try {
      await this.accountStore.setActiveCharacter(characterId);
    } catch {
      // Keep current panel selection even if active-character sync fails.
    }
  }

  private normalizeRarity(instanceRarity: string | null | undefined, itemRarity: string | null | undefined): string {
    const normalizedInstance = (instanceRarity ?? "").trim().toLowerCase();
    if (normalizedInstance.length > 0) {
      return normalizedInstance;
    }

    const normalizedItem = (itemRarity ?? "").trim().toLowerCase();
    if (normalizedItem.length > 0) {
      return normalizedItem;
    }

    return "common";
  }

  private resolvePrimaryWeaponPassive(modifiers: Readonly<Record<string, string>>): string {
    const primaryKeys = ["finisher", "on_hit", "basic_combo", "shot_pattern", "damage_profile", "focus"];
    for (const key of primaryKeys) {
      const value = modifiers[key];
      if (!value || value.trim().length === 0) {
        continue;
      }

      return `${formatModifierLabel(key)}: ${toTitleLabel(value)}`;
    }

    return "";
  }

  private canUnequipSlot(slotIndex: number): boolean {
    const slots = this.sigilLoadoutState()?.slots ?? [];
    return !slots.some((slot) => slot.slotIndex > slotIndex && !!slot.equippedSigil);
  }

  private findSigilSlotState(slotIndex: number): SigilSlotState | null {
    const slots = this.sigilLoadoutState()?.slots ?? buildFallbackSigilSlots(this.activeCharacter);
    return slots.find((slot) => slot.slotIndex === slotIndex) ?? null;
  }

  private buildSigilUsageByInstanceId(): Readonly<Record<string, {
    characterId: string;
    characterName: string;
    slotIndex: number;
  }>> {
    const usageByInstanceId: Record<string, {
      characterId: string;
      characterName: string;
      slotIndex: number;
    }> = {};

    const characters = Object.values(this.accountStore.state()?.characters ?? {});
    for (const character of characters) {
      const characterName = resolveCharacterDisplayName({
        characterId: character.characterId,
        preferredName: character.name
      });

      for (const slotIndex of [1, 2, 3, 4, 5]) {
        const sigil = resolveLoadoutSlot(character.sigilLoadout, slotIndex);
        if (!sigil?.instanceId) {
          continue;
        }

        usageByInstanceId[sigil.instanceId] = {
          characterId: character.characterId,
          characterName,
          slotIndex
        };
      }
    }

    return usageByInstanceId;
  }

  private async loadSigilState(characterId: string): Promise<void> {
    this.sigilActionError.set(null);
    try {
      const [inventory, loadout] = await Promise.all([
        this.accountStore.getSigilInventory(),
        this.accountStore.getCharacterSigilLoadout(characterId)
      ]);
      this.sigilInventory.set(inventory.sigils ?? []);
      this.sigilLoadoutState.set(loadout);
    } catch (error) {
      this.sigilActionError.set(this.stringifyError(error));
    }
  }

  private applySigilMutationState(mutation: SigilLoadoutMutationResponse): void {
    this.sigilInventory.set(mutation.inventory.sigils ?? []);
    this.sigilLoadoutState.set(mutation.characterLoadout);
  }

  private stringifyError(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }

    return "Failed to update Sigil loadout.";
  }
}

function buildFallbackSigilSlots(character: CharacterState | null): SigilSlotState[] {
  const unlockedSigilSlots = Math.min(5, Math.max(0, character?.unlockedSigilSlots ?? 0));
  const loadout = character?.sigilLoadout;

  return [1, 2, 3, 4, 5].map((slotIndex) => {
    const equippedSigil = resolveLoadoutSlot(loadout, slotIndex);
    const isUnlockedByMastery = slotIndex <= unlockedSigilSlots;
    const isPrerequisiteSatisfied = slotIndex === 1 || !!resolveLoadoutSlot(loadout, slotIndex - 1);
    const canEquipNow = isUnlockedByMastery && isPrerequisiteSatisfied;

    return {
      slotIndex,
      tierId: `tier_${slotIndex}`,
      tierName: `Tier ${slotIndex}`,
      isUnlockedByMastery,
      isPrerequisiteSatisfied,
      isAscendantUnlocked: false,
      canEquipNow,
      lockReasonCode: isUnlockedByMastery ? (isPrerequisiteSatisfied ? null : "prerequisite_unmet") : "mastery_locked",
      lockReason: isUnlockedByMastery ? (isPrerequisiteSatisfied ? null : "Equip previous slots first.") : "Slot is locked by mastery progression.",
      equippedSigil
    };
  });
}

function resolveLoadoutSlot(loadout: CharacterState["sigilLoadout"] | null | undefined, slotIndex: number): SigilInstance | null {
  if (!loadout) {
    return null;
  }

  if (slotIndex === 1) {
    return loadout.slot1 ?? null;
  }

  if (slotIndex === 2) {
    return loadout.slot2 ?? null;
  }

  if (slotIndex === 3) {
    return loadout.slot3 ?? null;
  }

  if (slotIndex === 4) {
    return loadout.slot4 ?? null;
  }

  if (slotIndex === 5) {
    return loadout.slot5 ?? null;
  }

  return null;
}

function readNumericModifier(modifiers: Readonly<Record<string, string>>, key: string): number | null {
  const raw = modifiers[key];
  if (!raw) {
    return null;
  }

  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

function formatSignedNumber(value: number): string {
  return value > 0 ? `+${value}` : `${value}`;
}

function formatModifierLabel(key: string): string {
  if (key === "basic_combo") return "Combo";
  if (key === "shot_pattern") return "Pattern";
  if (key === "damage_profile") return "Profile";
  if (key === "on_hit") return "On Hit";
  if (key === "finisher") return "Finisher";
  if (key === "focus") return "Focus";
  return toTitleLabel(key);
}

function toTitleLabel(value: string | null | undefined): string {
  const normalized = (value ?? "").trim().toLowerCase();
  if (normalized.length === 0) {
    return "";
  }

  return normalized
    .split(/[_\s-]+/)
    .map((token) => token.length > 0 ? token[0].toUpperCase() + token.slice(1) : token)
    .join(" ");
}

