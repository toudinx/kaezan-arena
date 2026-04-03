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
  type SetBonusDisplay,
  type WeaponInfo
} from "./components/info-panel/info-panel.component";
import {
  KaelisSelectionModalComponent,
  type SelectionModalMode,
  type SelectionItem
} from "./components/selection-modal/selection-modal.component";
import { BestiaryPageComponent } from "../bestiary/bestiary-page.component";
import type { CharacterState, EquipmentDefinition, ItemDefinition, OwnedEquipmentInstance } from "../../api/account-api.service";

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
  activeTab = signal<KaelisTab>('details');
  selectedCharacterId = signal<string | null>(null);
  modalOpen = signal(false);
  modalMode = signal<SelectionModalMode>('weapon');
  modalSelectedId = signal<string | null>(null);
  selectedSigilIndex = signal(0);

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
        portrait: { imageUrl: portrait.imageUrl, monogram: portrait.monogram, tone: portrait.tone }
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

  // Mock sigil data (no sigil API yet)
  readonly sigilSlots: (string | null)[] = [null, null, null, null, null];
  readonly sigilStats: InfoPanelStat[] = [];
  readonly sigilSetBonuses: SetBonusDisplay[] = [];

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

  setActiveTab(tab: KaelisTab): void {
    this.activeTab.set(tab);
  }

  selectEntry(id: string): void {
    this.selectedCharacterId.set(id);
  }

  previousEntry(): void {
    const entries = this.rosterEntries;
    if (!entries.length) return;
    const idx = entries.findIndex(e => e.id === this.selectedCharacterId());
    const prev = idx <= 0 ? entries.length - 1 : idx - 1;
    this.selectedCharacterId.set(entries[prev].id);
  }

  nextEntry(): void {
    const entries = this.rosterEntries;
    if (!entries.length) return;
    const idx = entries.findIndex(e => e.id === this.selectedCharacterId());
    const next = idx < 0 || idx >= entries.length - 1 ? 0 : idx + 1;
    this.selectedCharacterId.set(entries[next].id);
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

  openSigilModal(index: number): void {
    this.selectedSigilIndex.set(index);
    this.modalMode.set('sigil');
    this.modalSelectedId.set(null);
    this.modalOpen.set(true);
  }

  closeModal(): void {
    this.modalOpen.set(false);
  }

  confirmSelection(_id: string | null): void {
    // Selection persistence not yet implemented
    this.modalOpen.set(false);
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
