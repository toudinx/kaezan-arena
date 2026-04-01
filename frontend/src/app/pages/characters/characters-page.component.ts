import { Component, OnDestroy, OnInit } from "@angular/core";
import { RouterLink, ActivatedRoute, Router } from "@angular/router";
import { Subscription, combineLatest } from "rxjs";
import { type AccountState, type CharacterState } from "../../api/account-api.service";
import { AccountStore } from "../../account/account-store.service";
import { mapInventoryToBackpackSlots, type BackpackSlot } from "../../shared/backpack/backpack-inventory.helpers";
import { BestiaryPageComponent } from "../bestiary/bestiary-page.component";
import { type ItemIconTone } from "../../shared/items/item-visuals.helpers";
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

type KaelisTabId = "overview" | "loadout" | "skills" | "bestiary";
type HubTransitionKind = "section" | "character";
const DEFAULT_KAELIS_TAB: KaelisTabId = "overview";
const HUB_TRANSITION_MS = 180;

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
  roleTag: string;
  kitBadge: "melee" | "ranged" | "unknown";
  bestiaryTrackedSpeciesCount: number;
  bestiaryKillsTotal: number;
  primalCoreTotal: number;
  portrait: CharacterPortraitVisual;
  xpProgressPercent: number;
}>;

type CharacterGearSlot = "weapon";

type CharacterGearSlotRow = Readonly<{
  slot: CharacterGearSlot;
  slotLabel: string;
  displayName: string;
  typeLabel: string;
  rarityLabel: string;
  rarityClass: "common" | "rare" | "epic" | "legendary" | "ascendant";
  iconGlyph: string;
  iconTone: ItemIconTone;
  impactSummary: string;
  detailLines: ReadonlyArray<string>;
  tooltip: string;
  stateLabel: "Equipped" | "Empty" | "Missing";
}>;

type LoadoutSigilSlotRow = Readonly<{
  slotId: string;
  label: string;
  sourceLabel: string;
  tooltip: string;
  stateLabel: "Equipped" | "Vacant" | "Missing" | "Reserved";
  gear: CharacterGearSlotRow | null;
}>;

type KaelisPassiveViewModel = Readonly<{
  label: string;
  summary: string;
  tooltip: string;
  isPlaceholder: boolean;
}>;

type KaelisSectionNavItem = Readonly<{
  id: KaelisTabId;
  label: string;
  summary: string;
}>;

const KAELIS_SECTION_NAV_ITEMS: ReadonlyArray<KaelisSectionNavItem> = [
  {
    id: "overview",
    label: "Overview",
    summary: "Identity, level progress, and account-facing snapshot."
  },
  {
    id: "loadout",
    label: "Loadout",
    summary: "Weapon focus and sigil-slot build posture."
  },
  {
    id: "skills",
    label: "Skills",
    summary: "Passive, fixed kit, and free-slot combat context."
  },
  {
    id: "bestiary",
    label: "Bestiary",
    summary: "Species progression, crafting, refine, and salvage operations."
  }
] as const;

const CHARACTER_GEAR_SLOT_ORDER: readonly CharacterGearSlot[] = ["weapon"];
const LOADOUT_SIGIL_LABELS: ReadonlyArray<string> = ["Sigil I", "Sigil II", "Sigil III", "Sigil IV", "Sigil V"];
const FREE_SLOT_TOOLTIP = "One additional attack weapon can be chosen during each run.";
const PASSIVE_PLACEHOLDER: KaelisPassiveViewModel = {
  label: "Passive not surfaced",
  summary: "Passive metadata is not exposed by the current account catalog yet.",
  tooltip: "Kaelis passive details will appear here once backend catalog support is available.",
  isPlaceholder: true
};

@Component({
  selector: "app-characters-page",
  standalone: true,
  imports: [RouterLink, BestiaryPageComponent],
  templateUrl: "./characters-page.component.html",
  styleUrl: "./characters-page.component.css"
})
export class CharactersPageComponent implements OnInit, OnDestroy {
  actionMessage: string | null = null;
  actionError: string | null = null;
  setActiveInFlightCharacterId: string | null = null;
  isHubTransitioning = false;
  hubTransitionKind: HubTransitionKind | null = null;
  readonly freeSlotTooltip = FREE_SLOT_TOOLTIP;
  readonly sectionNavItems = KAELIS_SECTION_NAV_ITEMS;

  private localSelectedCharacterId: string | null = null;
  private routeCharacterId: string | null = null;
  private routeTabId: KaelisTabId = DEFAULT_KAELIS_TAB;
  private routeSubscription: Subscription | null = null;
  private hasHydratedRouteState = false;
  private hubTransitionTimeoutHandle: ReturnType<typeof setTimeout> | null = null;
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

    this.routeSubscription = combineLatest([this.route.paramMap, this.route.queryParamMap]).subscribe(([params, query]) => {
      const rawCharacterId = params.get("id");
      const trimmed = rawCharacterId?.trim() ?? "";
      const nextRouteCharacterId = trimmed.length > 0 ? trimmed : null;
      const nextRouteTabId = this.parseRouteTabId(query.get("tab"));
      const previousRouteCharacterId = this.routeCharacterId;
      const previousRouteTabId = this.routeTabId;
      const hasPreviousState = this.hasHydratedRouteState;

      this.routeCharacterId = nextRouteCharacterId;
      this.routeTabId = nextRouteTabId;
      this.hasHydratedRouteState = true;

      if (!hasPreviousState) {
        return;
      }

      if (previousRouteCharacterId !== nextRouteCharacterId) {
        this.startHubTransition("character");
        return;
      }

      if (previousRouteTabId !== nextRouteTabId) {
        this.startHubTransition("section");
      }
    });
  }

  ngOnDestroy(): void {
    this.routeSubscription?.unsubscribe();
    this.routeSubscription = null;
    this.clearHubTransitionTimer();
  }

  get isLoading(): boolean {
    return this.accountStore.isLoading();
  }

  get loadError(): string | null {
    return this.accountStore.error();
  }

  get activeTab(): KaelisTabId {
    return this.routeTabId;
  }

  get isBestiaryTab(): boolean {
    return this.activeTab === "bestiary";
  }

  get isSectionSwitching(): boolean {
    return this.isHubTransitioning && this.hubTransitionKind === "section";
  }

  get isCharacterSwitching(): boolean {
    return this.isHubTransitioning && this.hubTransitionKind === "character";
  }

  get selectedCharacterRouteCommands(): ReadonlyArray<string> {
    const selectedCharacterId = this.selectedCharacterId;
    if (selectedCharacterId) {
      return ["/characters", selectedCharacterId];
    }

    return ["/characters"];
  }

  get characterRows(): CharacterRow[] {
    const state = this.accountStore.state();
    if (!state) {
      return [];
    }

    return Object.values(state.characters)
      .map((character) => this.toCharacterRow(character, state))
      .sort((left, right) => {
        const byLevel = right.level - left.level;
        if (byLevel !== 0) {
          return byLevel;
        }
        const byName = left.name.localeCompare(right.name, undefined, { sensitivity: "base" });
        return byName !== 0 ? byName : left.characterId.localeCompare(right.characterId);
      });
  }

  get selectedCharacterId(): string | null {
    const state = this.accountStore.state();
    if (!state) {
      return null;
    }

    if (this.routeCharacterId && state.characters[this.routeCharacterId]) {
      return this.routeCharacterId;
    }

    if (this.localSelectedCharacterId && state.characters[this.localSelectedCharacterId]) {
      return this.localSelectedCharacterId;
    }

    const activeCharacterId = this.accountStore.activeCharacterId();
    if (activeCharacterId && state.characters[activeCharacterId]) {
      return activeCharacterId;
    }

    return Object.values(state.characters)[0]?.characterId ?? null;
  }

  get selectedCharacter(): CharacterRow | null {
    const selectedCharacterId = this.selectedCharacterId;
    if (!selectedCharacterId) {
      return null;
    }

    return this.characterRows.find((row) => row.characterId === selectedCharacterId) ?? null;
  }

  get selectedKaelisPassive(): KaelisPassiveViewModel {
    if (!this.selectedCharacter) {
      return PASSIVE_PLACEHOLDER;
    }

    return PASSIVE_PLACEHOLDER;
  }

  get stageLabel(): string {
    if (this.activeTab === "overview") {
      return "Overview Stage";
    }

    if (this.activeTab === "loadout") {
      return "Loadout Stage";
    }

    if (this.activeTab === "skills") {
      return "Skill Stage";
    }

    return "Bestiary Stage";
  }

  get stageDescription(): string {
    if (this.activeTab === "overview") {
      return "Core identity and run-readiness snapshot.";
    }

    if (this.activeTab === "loadout") {
      return "Build posture centered on one Weapon lane and five Sigil slots.";
    }

    if (this.activeTab === "skills") {
      return "Passive, fixed kit, and free-slot readiness in one combat lane.";
    }

    return "Species progression stage for the selected Kaelis.";
  }

  get selectedLoadoutWeapon(): CharacterGearSlotRow | null {
    return this.selectedCharacter?.equippedGearSlots.find((gear) => gear.slot === "weapon") ?? null;
  }

  get selectedLoadoutWeaponDetailLines(): ReadonlyArray<string> {
    const weapon = this.selectedLoadoutWeapon;
    if (!weapon) {
      return [];
    }

    if (weapon.detailLines.length > 0) {
      return weapon.detailLines.slice(0, 3);
    }

    return weapon.impactSummary.trim().length > 0 ? [weapon.impactSummary] : [];
  }

  get selectedLoadoutSigils(): ReadonlyArray<LoadoutSigilSlotRow> {
    return [
      this.createReservedSigilSlot("sigil-1", LOADOUT_SIGIL_LABELS[0] ?? "Sigil I"),
      this.createReservedSigilSlot("sigil-2", LOADOUT_SIGIL_LABELS[1] ?? "Sigil II"),
      this.createReservedSigilSlot("sigil-3", LOADOUT_SIGIL_LABELS[2] ?? "Sigil III"),
      this.createReservedSigilSlot("sigil-4", LOADOUT_SIGIL_LABELS[3] ?? "Sigil IV"),
      this.createReservedSigilSlot("sigil-5", LOADOUT_SIGIL_LABELS[4] ?? "Sigil V")
    ];
  }

  selectCharacter(characterId: string): void {
    if (!characterId || this.selectedCharacterId === characterId) {
      return;
    }

    this.startHubTransition("character");
    this.localSelectedCharacterId = characterId;
    void this.router.navigate(["/characters", characterId], {
      queryParams: { tab: this.activeTab }
    });
  }

  onSectionNavSelect(tabId: KaelisTabId): void {
    if (tabId === this.activeTab) {
      return;
    }

    this.startHubTransition("section");
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
      this.actionMessage = `Active Kaelis set to ${this.resolveCharacterName(characterId)}.`;
    } catch (error) {
      this.actionError = this.accountStore.error() ?? this.stringifyError(error);
    } finally {
      this.setActiveInFlightCharacterId = null;
    }
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
    const portrait = resolveCharacterPortraitVisual({
      characterId: character.characterId,
      displayName: name
    });
    const xpThreshold = Math.max(1, character.level * 100);
    const xpProgressPercent = Math.min(100, Math.max(0, (character.xp / xpThreshold) * 100));
    const bestiaryKillsEntries = Object.entries(character.bestiaryKillsBySpecies ?? {});
    const bestiaryTrackedSpeciesCount = bestiaryKillsEntries.filter(([, kills]) => Math.max(0, kills ?? 0) > 0).length;
    const bestiaryKillsTotal = bestiaryKillsEntries.reduce((total, [, kills]) => total + Math.max(0, kills ?? 0), 0);
    const primalCoreTotal = Object.values(character.primalCoreBySpecies ?? {}).reduce((total, value) => total + Math.max(0, value ?? 0), 0);

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
      roleTag: this.toRoleTag(kitBadge),
      kitBadge,
      bestiaryTrackedSpeciesCount,
      bestiaryKillsTotal,
      primalCoreTotal,
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

  private toRoleTag(badge: "melee" | "ranged" | "unknown"): string {
    if (badge === "melee") {
      return "Melee";
    }

    if (badge === "ranged") {
      return "Ranged";
    }

    return "Unknown";
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
      const slotLabel = this.resolveSlotLabel(slot);
      if (missingInstanceId) {
        const impactSummary = "Configured but missing from inventory";
        return {
          slot,
          slotLabel,
          displayName: "Missing item",
          typeLabel: `Instance ${missingInstanceId}`,
          rarityLabel: "Unknown",
          rarityClass: "common",
          iconGlyph: this.resolveGearIconGlyph(slot),
          iconTone: this.resolveGearIconTone(slot),
          impactSummary,
          detailLines: [],
          tooltip: `${slotLabel}: Missing item - ${impactSummary}`,
          stateLabel: "Missing"
        };
      }

      const impactSummary = "Equip an item from Backpack";
      return {
        slot,
        slotLabel,
        displayName: "Empty slot",
        typeLabel: "No item equipped",
        rarityLabel: "None",
        rarityClass: "common",
        iconGlyph: this.resolveGearIconGlyph(slot),
        iconTone: this.resolveGearIconTone(slot),
        impactSummary,
        detailLines: [],
        tooltip: `${slotLabel}: Empty slot - ${impactSummary}`,
        stateLabel: "Empty"
      };
    });
  }

  private createEquippedGearSlotRow(slot: BackpackSlot): CharacterGearSlotRow {
    const impactSummary = slot.impactBadges.length > 0 ? slot.impactBadges.slice(0, 2).join(" | ") : slot.shortStatSummary;
    return {
      slot: slot.slot === "weapon" ? slot.slot : "weapon",
      slotLabel: slot.slotLabel,
      displayName: slot.displayName,
      typeLabel: slot.typeLabel,
      rarityLabel: slot.rarityLabel,
      rarityClass: this.resolveRarityClass(slot.rarity),
      iconGlyph: slot.iconGlyph,
      iconTone: slot.iconTone,
      impactSummary,
      detailLines: slot.detailStatLines,
      tooltip: `${slot.slotLabel}: ${slot.displayName} - ${impactSummary}`,
      stateLabel: "Equipped"
    };
  }

  private mapGearToSigilSlot(
    slotId: string,
    label: string,
    sourceLabel: string,
    gear: CharacterGearSlotRow | null
  ): LoadoutSigilSlotRow {
    if (!gear || gear.stateLabel === "Empty") {
      return {
        slotId,
        label,
        sourceLabel,
        tooltip: `${label}: Vacant (${sourceLabel} lane).`,
        stateLabel: "Vacant",
        gear: null
      };
    }

    const stateLabel = gear.stateLabel === "Missing" ? "Missing" : "Equipped";
    return {
      slotId,
      label,
      sourceLabel,
      tooltip: gear.tooltip,
      stateLabel,
      gear
    };
  }

  private createReservedSigilSlot(slotId: string, label: string): LoadoutSigilSlotRow {
    return {
      slotId,
      label,
      sourceLabel: "Future",
      tooltip: `${label}: Reserved for future sigil slots.`,
      stateLabel: "Reserved",
      gear: null
    };
  }

  private resolveEquipmentInstanceId(character: CharacterState, slot: CharacterGearSlot): string | null {
    if (slot === "weapon") {
      return character.equipment.weaponInstanceId ?? null;
    }

    return null;
  }

  private resolveSlotLabel(slot: CharacterGearSlot): string {
    if (slot === "weapon") {
      return "Weapon";
    }

    return "Weapon";
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

  private resolveGearIconGlyph(slot: CharacterGearSlot): string {
    if (slot === "weapon") {
      return "WP";
    }

    return "WP";
  }

  private resolveGearIconTone(slot: CharacterGearSlot): ItemIconTone {
    if (slot === "weapon") {
      return "weapon";
    }

    return "weapon";
  }

  private resolveCharacterName(characterId: string): string {
    return this.accountStore.state()?.characters[characterId]?.name ?? characterId;
  }

  private parseRouteTabId(value: string | null): KaelisTabId {
    if (value === "passive") {
      return "skills";
    }

    if (value === "overview" || value === "loadout" || value === "skills" || value === "bestiary") {
      return value;
    }

    return DEFAULT_KAELIS_TAB;
  }

  private startHubTransition(kind: HubTransitionKind): void {
    this.clearHubTransitionTimer();
    this.hubTransitionKind = kind;
    this.isHubTransitioning = true;
    this.hubTransitionTimeoutHandle = setTimeout(() => {
      this.isHubTransitioning = false;
      this.hubTransitionKind = null;
      this.hubTransitionTimeoutHandle = null;
    }, HUB_TRANSITION_MS);
  }

  private clearHubTransitionTimer(): void {
    if (this.hubTransitionTimeoutHandle === null) {
      return;
    }

    clearTimeout(this.hubTransitionTimeoutHandle);
    this.hubTransitionTimeoutHandle = null;
  }

  private stringifyError(error: unknown): string {
    if (!error) {
      return "Unknown error";
    }

    return error instanceof Error ? error.message : String(error);
  }
}
