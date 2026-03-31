import { Component, OnDestroy, OnInit } from "@angular/core";
import { RouterLink, ActivatedRoute, Router } from "@angular/router";
import { Subscription } from "rxjs";
import { type AccountState, type CharacterState } from "../../api/account-api.service";
import { AccountStore } from "../../account/account-store.service";
import { mapInventoryToBackpackSlots, type BackpackSlot } from "../../shared/backpack/backpack-inventory.helpers";
import {
  resolveCharacterPortraitVisual,
  type CharacterPortraitVisual
} from "../../shared/characters/character-visuals.helpers";
import {
  resolveKitBadgeForSkills,
  resolveSkillPresentation,
  type SkillVisualFamily,
  type SkillVisualTier
} from "../../shared/skills/skill-presentation.helpers";

const CHARACTER_PLAYSTYLE: Readonly<Record<string, string>> = {
  "character:kina": "Controls space with escalating melee AoE. A fast frontal strike leads into wider pulses - pressure builds as the arena fills.",
  "character:ranged_prototype": "Fires from distance using projectiles that bounce, pierce, and scatter. Trades melee pressure for reach and multi-target coverage."
};

type CharacterFixedWeaponViewModel = Readonly<{
  skillId: string | null;
  label: string;
  iconGlyph: string;
  family: SkillVisualFamily;
  tier: SkillVisualTier;
  description: string;
}>;

type CharacterRow = Readonly<{
  characterId: string;
  name: string;
  subtitle: string;
  playstyle: string;
  level: number;
  xp: number;
  isActive: boolean;
  isProvisional: boolean;
  equippedGearSlots: ReadonlyArray<CharacterGearSlotRow>;
  fixedWeapons: ReadonlyArray<CharacterFixedWeaponViewModel>;
  kitTypeLabel: string;
  kitBadge: "melee" | "ranged" | "unknown";
  portrait: CharacterPortraitVisual;
  xpProgressPercent: number;
}>;

type CharacterGearSlot = "weapon" | "armor" | "relic";

type CharacterGearSlotRow = Readonly<{
  slot: CharacterGearSlot;
  slotLabel: string;
  displayName: string;
  typeLabel: string;
  rarityLabel: string;
  rarityClass: "common" | "rare" | "epic" | "legendary" | "ascendant";
  impactSummary: string;
  stateLabel: "Equipped" | "Empty" | "Missing";
}>;

const CHARACTER_GEAR_SLOT_ORDER: readonly CharacterGearSlot[] = ["weapon", "armor", "relic"];

@Component({
  selector: "app-characters-page",
  standalone: true,
  imports: [RouterLink],
  templateUrl: "./characters-page.component.html",
  styleUrl: "./characters-page.component.css"
})
export class CharactersPageComponent implements OnInit, OnDestroy {
  actionMessage: string | null = null;
  actionError: string | null = null;
  setActiveInFlightCharacterId: string | null = null;

  private localSelectedCharacterId: string | null = null;
  private routeCharacterId: string | null = null;
  private routeSubscription: Subscription | null = null;
  private readonly portraitImageFailures = new Set<string>();

  constructor(
    private readonly accountStore: AccountStore,
    private readonly route: ActivatedRoute,
    private readonly router: Router
  ) {}

  async ngOnInit(): Promise<void> {
    try {
      await this.accountStore.load();
    } catch {
      // Render reads store error state.
    }

    this.routeSubscription = this.route.paramMap.subscribe((params) => {
      const rawCharacterId = params.get("id");
      const trimmed = rawCharacterId?.trim() ?? "";
      this.routeCharacterId = trimmed.length > 0 ? trimmed : null;
    });
  }

  ngOnDestroy(): void {
    this.routeSubscription?.unsubscribe();
    this.routeSubscription = null;
  }

  get isLoading(): boolean {
    return this.accountStore.isLoading();
  }

  get loadError(): string | null {
    return this.accountStore.error();
  }

  get characterRows(): CharacterRow[] {
    const state = this.accountStore.state();
    if (!state) {
      return [];
    }

    return Object.values(state.characters)
      .map((character) => this.toCharacterRow(character, state))
      .sort((left, right) => {
        const byName = left.name.localeCompare(right.name, undefined, { sensitivity: "base" });
        return byName !== 0 ? byName : left.characterId.localeCompare(right.characterId);
      });
  }

  get selectedCharacterId(): string | null {
    const state = this.accountStore.state();
    if (!state) {
      return null;
    }

    if (this.localSelectedCharacterId && state.characters[this.localSelectedCharacterId]) {
      return this.localSelectedCharacterId;
    }

    if (this.routeCharacterId && state.characters[this.routeCharacterId]) {
      return this.routeCharacterId;
    }

    const activeCharacterId = this.accountStore.activeCharacterId();
    if (activeCharacterId && state.characters[activeCharacterId]) {
      return activeCharacterId;
    }

    return Object.values(state.characters)[0]?.characterId ?? null;
  }

  selectCharacter(characterId: string): void {
    this.localSelectedCharacterId = characterId;
  }

  get selectedCharacter(): CharacterRow | null {
    const selectedCharacterId = this.selectedCharacterId;
    if (!selectedCharacterId) {
      return null;
    }

    return this.characterRows.find((row) => row.characterId === selectedCharacterId) ?? null;
  }

  get isCharacterRoute(): boolean {
    return !!this.routeCharacterId;
  }

  async setActiveCharacter(characterId: string, event?: Event): Promise<void> {
    event?.stopPropagation();
    event?.preventDefault();

    if (!characterId || this.setActiveInFlightCharacterId) {
      return;
    }

    this.actionMessage = null;
    this.actionError = null;
    this.setActiveInFlightCharacterId = characterId;

    try {
      await this.accountStore.setActiveCharacter(characterId);
      this.actionMessage = `Active character set to ${this.resolveCharacterName(characterId)}.`;
    } catch (error) {
      this.actionError = this.accountStore.error() ?? this.stringifyError(error);
    } finally {
      this.setActiveInFlightCharacterId = null;
    }
  }

  async viewCharacter(characterId: string): Promise<void> {
    await this.router.navigate(["/characters", characterId]);
  }

  async clearCharacterRoute(): Promise<void> {
    await this.router.navigate(["/characters"]);
  }

  openBackpack(): void {
    if (typeof window === "undefined") {
      return;
    }

    window.dispatchEvent(new CustomEvent("kaezan-open-backpack"));
  }

  isSetActiveInFlight(characterId: string): boolean {
    return this.setActiveInFlightCharacterId === characterId;
  }

  isPortraitImageFailed(imageUrl: string | null | undefined): boolean {
    if (!imageUrl) {
      return true;
    }

    return this.portraitImageFailures.has(imageUrl);
  }

  onPortraitImageError(imageUrl: string | null | undefined): void {
    if (!imageUrl) {
      return;
    }

    this.portraitImageFailures.add(imageUrl);
  }

  private toCharacterRow(character: CharacterState, account: AccountState): CharacterRow {
    const catalogEntry = this.accountStore.catalogs().characterById[character.characterId];
    const name = catalogEntry?.displayName ?? character.name;
    const fixedWeaponNames: ReadonlyArray<string> = catalogEntry?.fixedWeaponNames ?? [];
    const fixedWeaponIds: ReadonlyArray<string> = catalogEntry?.fixedWeaponIds ?? [];
    const fixedWeapons = this.mapFixedWeapons(fixedWeaponIds, fixedWeaponNames);
    const kitBadge = resolveKitBadgeForSkills(
      fixedWeapons.map((weapon) => ({ skillId: weapon.skillId, displayName: weapon.label }))
    );
    const kitTypeLabel = this.toKitLabel(kitBadge);
    const portrait = resolveCharacterPortraitVisual({
      characterId: character.characterId,
      displayName: name
    });
    const xpThreshold = Math.max(1, character.level * 100);
    const xpProgressPercent = Math.min(100, Math.max(0, (character.xp / xpThreshold) * 100));

    return {
      characterId: character.characterId,
      name,
      subtitle: catalogEntry?.subtitle ?? "",
      playstyle: CHARACTER_PLAYSTYLE[character.characterId] ?? "",
      level: character.level,
      xp: character.xp,
      isActive: account.activeCharacterId === character.characterId,
      isProvisional: catalogEntry?.isProvisional ?? false,
      equippedGearSlots: this.resolveEquippedGearSlots(character),
      fixedWeapons,
      kitTypeLabel,
      kitBadge,
      portrait,
      xpProgressPercent
    };
  }

  private mapFixedWeapons(
    fixedWeaponIds: ReadonlyArray<string>,
    fixedWeaponNames: ReadonlyArray<string>
  ): ReadonlyArray<CharacterFixedWeaponViewModel> {
    const size = Math.max(fixedWeaponIds.length, fixedWeaponNames.length);
    const rows: CharacterFixedWeaponViewModel[] = [];

    for (let index = 0; index < size; index += 1) {
      const id = fixedWeaponIds[index] ?? null;
      const name = fixedWeaponNames[index] ?? null;
      const presentation = resolveSkillPresentation({
        skillId: id,
        displayName: name,
        fallbackLabel: name ?? id ?? `Skill ${index + 1}`
      });

      rows.push({
        skillId: presentation.canonicalId ?? id,
        label: presentation.label,
        iconGlyph: presentation.iconGlyph,
        family: presentation.family,
        tier: presentation.tier,
        description: presentation.description
      });
    }

    return rows;
  }

  private toKitLabel(badge: "melee" | "ranged" | "unknown"): string {
    if (badge === "melee") {
      return "Melee Kit";
    }

    if (badge === "ranged") {
      return "Ranged Kit";
    }

    return "Unknown Kit";
  }

  private resolveEquippedGearSlots(character: CharacterState): ReadonlyArray<CharacterGearSlotRow> {
    const catalog = this.accountStore.catalogs();
    const allSlots = mapInventoryToBackpackSlots(character, catalog.itemById, catalog.equipmentById);

    return CHARACTER_GEAR_SLOT_ORDER.map((slot) => {
      const equippedSlot = allSlots.find((entry) => entry.isEquipped && entry.slot === slot) ?? null;
      if (equippedSlot) {
        return this.createEquippedGearSlotRow(equippedSlot);
      }

      const missingInstanceId = this.resolveEquipmentInstanceId(character, slot);
      if (missingInstanceId) {
        return {
          slot,
          slotLabel: this.resolveSlotLabel(slot),
          displayName: "Missing item",
          typeLabel: `Instance ${missingInstanceId}`,
          rarityLabel: "Unknown",
          rarityClass: "common",
          impactSummary: "Configured but missing from inventory",
          stateLabel: "Missing"
        };
      }

      return {
        slot,
        slotLabel: this.resolveSlotLabel(slot),
        displayName: "Empty slot",
        typeLabel: "No item equipped",
        rarityLabel: "None",
        rarityClass: "common",
        impactSummary: "Equip an item from Backpack",
        stateLabel: "Empty"
      };
    });
  }

  private createEquippedGearSlotRow(slot: BackpackSlot): CharacterGearSlotRow {
    return {
      slot: slot.slot === "weapon" || slot.slot === "armor" || slot.slot === "relic" ? slot.slot : "weapon",
      slotLabel: slot.slotLabel,
      displayName: slot.displayName,
      typeLabel: slot.typeLabel,
      rarityLabel: slot.rarityLabel,
      rarityClass: this.resolveRarityClass(slot.rarity),
      impactSummary: slot.impactBadges.length > 0 ? slot.impactBadges.slice(0, 2).join(" • ") : slot.shortStatSummary,
      stateLabel: "Equipped"
    };
  }

  private resolveEquipmentInstanceId(character: CharacterState, slot: CharacterGearSlot): string | null {
    if (slot === "weapon") {
      return character.equipment.weaponInstanceId ?? null;
    }

    if (slot === "armor") {
      return character.equipment.armorInstanceId ?? null;
    }

    return character.equipment.relicInstanceId ?? null;
  }

  private resolveSlotLabel(slot: CharacterGearSlot): string {
    if (slot === "weapon") {
      return "Weapon";
    }

    if (slot === "armor") {
      return "Armor";
    }

    return "Relic";
  }

  private resolveRarityClass(rarity: string): "common" | "rare" | "epic" | "legendary" | "ascendant" {
    const normalized = (rarity ?? "").trim().toLowerCase();
    if (normalized === "rare") {
      return "rare";
    }

    if (normalized === "epic") {
      return "epic";
    }

    if (normalized === "legendary") {
      return "legendary";
    }

    if (normalized === "ascendant") {
      return "ascendant";
    }

    return "common";
  }

  private resolveCharacterName(characterId: string): string {
    return this.accountStore.state()?.characters[characterId]?.name ?? characterId;
  }

  private stringifyError(error: unknown): string {
    if (!error) {
      return "Unknown error";
    }

    return error instanceof Error ? error.message : String(error);
  }
}
