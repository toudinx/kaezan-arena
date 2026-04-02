import { Component, OnDestroy, OnInit } from "@angular/core";
import { RouterLink, ActivatedRoute, Router } from "@angular/router";
import { Subscription, combineLatest } from "rxjs";
import { type AccountState, type AscendantTierProgress, type CharacterState, type SigilInstance } from "../../api/account-api.service";
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
  masteryLevel: number;
  masteryXp: number;
  masteryXpForCurrentLevel: number;
  masteryXpRequiredForNextLevel: number;
  unlockedSigilSlots: number;
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
  masteryProgressPercent: number;
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

type SigilSlotViewModel = Readonly<{
  slotIndex: number;
  tierName: string;
  levelRangeLabel: string;
  equipped: SigilInstance | null;
  isUnlocked: boolean;
  lockLabel: string | null;
  ascendantUnlocked: boolean;
  ascendantHint: string | null;
}>;

type SigilInventoryRowViewModel = Readonly<{
  sigil: SigilInstance;
  canEquip: boolean;
  isEquippedInSelectedSlot: boolean;
  disabledReason: string | null;
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
    summary: "Identity, mastery progress, and account-facing snapshot."
  },
  {
    id: "loadout",
    label: "Loadout",
    summary: "Weapon focus and sigil-slot build posture."
  },
  {
    id: "skills",
    label: "Skills",
    summary: "Passive, fixed kit, and ultimate-slot combat context."
  },
  {
    id: "bestiary",
    label: "Bestiary",
    summary: "Species progression, crafting, refine, and salvage operations."
  }
] as const;

const CHARACTER_GEAR_SLOT_ORDER: readonly CharacterGearSlot[] = ["weapon"];
const SIGIL_SLOT_TIER_NAMES: ReadonlyArray<string> = ["Hollow", "Brave", "Awakened", "Exalted", "Ascendant"];
const SIGIL_SLOT_LEVEL_RANGES: ReadonlyArray<Readonly<{ min: number; max: number }>> = [
  { min: 1, max: 20 },
  { min: 21, max: 40 },
  { min: 41, max: 60 },
  { min: 61, max: 80 },
  { min: 81, max: 95 }
];
const ULTIMATE_SLOT_TOOLTIP = "Gauge-based Ultimate that auto-fires when charged.";
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
  sigilActionInFlightKey: string | null = null;
  isHubTransitioning = false;
  hubTransitionKind: HubTransitionKind | null = null;
  readonly ultimateSlotTooltip = ULTIMATE_SLOT_TOOLTIP;
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
        const byLevel = right.masteryLevel - left.masteryLevel;
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

  get echoFragmentsBalance(): number {
    return Math.max(0, this.accountStore.state()?.echoFragmentsBalance ?? 0);
  }

  get kaerosBalance(): number {
    return Math.max(0, this.accountStore.state()?.kaerosBalance ?? 0);
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
      return "Passive, fixed kit, and ultimate-slot readiness in one combat lane.";
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

  get selectedCharacterState(): CharacterState | null {
    const state = this.accountStore.state();
    const selectedCharacterId = this.selectedCharacterId;
    if (!state || !selectedCharacterId) {
      return null;
    }

    return state.characters[selectedCharacterId] ?? null;
  }

  get selectedLoadoutSigils(): ReadonlyArray<SigilSlotViewModel> {
    const selectedCharacterState = this.selectedCharacterState;
    if (!selectedCharacterState) {
      return [];
    }

    const ascendantByTierIndex = new Map<number, AscendantTierProgress>(
      (selectedCharacterState.ascendantProgress ?? [])
        .filter((t) => t.speciesRequired > 0)
        .map((t) => [t.tierIndex, t])
    );

    return SIGIL_SLOT_LEVEL_RANGES.map((range, zeroBasedIndex) => {
      const slotIndex = zeroBasedIndex + 1;
      const equipped = this.resolveEquippedSigilForSlot(selectedCharacterState, slotIndex);
      const isUnlocked = slotIndex <= Math.max(1, selectedCharacterState.unlockedSigilSlots ?? 1);
      const lockLabel = isUnlocked ? null : `Locked - Mastery ${this.resolveMasteryRequirementForSlot(slotIndex)} required`;
      const ascendantTier = ascendantByTierIndex.get(zeroBasedIndex);
      const ascendantUnlocked = ascendantTier?.isUnlocked ?? false;
      const ascendantHint = ascendantTier
        ? ascendantUnlocked
          ? "Ascendant Available"
          : `Ascendant: ${ascendantTier.speciesAtMaxRank}/${ascendantTier.speciesRequired} species at Rank 5`
        : null;
      return {
        slotIndex,
        tierName: SIGIL_SLOT_TIER_NAMES[zeroBasedIndex] ?? `Tier ${slotIndex}`,
        levelRangeLabel: `${range.min}-${range.max}`,
        equipped,
        isUnlocked,
        lockLabel,
        ascendantUnlocked,
        ascendantHint
      };
    });
  }

  get selectedCharacterSigilInventoryRows(): ReadonlyArray<SigilInventoryRowViewModel> {
    const selectedCharacterState = this.selectedCharacterState;
    const state = this.accountStore.state();
    if (!selectedCharacterState || !state) {
      return [];
    }

    const sigils = (state.sigilInventory ?? []).slice().sort((left, right) => {
      const bySlot = left.slotIndex - right.slotIndex;
      if (bySlot !== 0) {
        return bySlot;
      }
      const byLevel = right.sigilLevel - left.sigilLevel;
      if (byLevel !== 0) {
        return byLevel;
      }
      return left.instanceId.localeCompare(right.instanceId);
    });

    return sigils.map((sigil) => this.toSigilInventoryRowViewModel(selectedCharacterState, sigil));
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

  async equipSigil(sigilInstanceId: string, event?: Event): Promise<void> {
    event?.stopPropagation();
    event?.preventDefault();

    const selectedCharacterId = this.selectedCharacterId;
    if (!selectedCharacterId || !sigilInstanceId || this.sigilActionInFlightKey) {
      return;
    }

    this.actionMessage = null;
    this.actionError = null;
    this.sigilActionInFlightKey = `equip:${sigilInstanceId}`;

    try {
      await this.accountStore.equipSigil(selectedCharacterId, sigilInstanceId);
      this.actionMessage = "Sigil equipped.";
    } catch (error) {
      this.actionError = this.accountStore.error() ?? this.stringifyError(error);
    } finally {
      this.sigilActionInFlightKey = null;
    }
  }

  async unequipSigil(slotIndex: number, event?: Event): Promise<void> {
    event?.stopPropagation();
    event?.preventDefault();

    const selectedCharacterId = this.selectedCharacterId;
    if (!selectedCharacterId || this.sigilActionInFlightKey) {
      return;
    }

    this.actionMessage = null;
    this.actionError = null;
    this.sigilActionInFlightKey = `unequip:${slotIndex}`;

    try {
      await this.accountStore.unequipSigil(selectedCharacterId, slotIndex);
      this.actionMessage = `Sigil slot ${slotIndex} unequipped.`;
    } catch (error) {
      this.actionError = this.accountStore.error() ?? this.stringifyError(error);
    } finally {
      this.sigilActionInFlightKey = null;
    }
  }

  isSigilActionInFlight(actionKey: string): boolean {
    return this.sigilActionInFlightKey === actionKey;
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
    const masteryXpRequiredForNextLevel = Math.max(0, character.masteryXpRequiredForNextLevel ?? 0);
    const masteryXpForCurrentLevel = Math.max(0, character.masteryXpForCurrentLevel ?? 0);
    const masteryProgressPercent = masteryXpRequiredForNextLevel <= 0
      ? 100
      : Math.min(100, Math.max(0, (masteryXpForCurrentLevel / masteryXpRequiredForNextLevel) * 100));
    const bestiaryKillsEntries = Object.entries(character.bestiaryKillsBySpecies ?? {});
    const bestiaryTrackedSpeciesCount = bestiaryKillsEntries.filter(([, kills]) => Math.max(0, kills ?? 0) > 0).length;
    const bestiaryKillsTotal = bestiaryKillsEntries.reduce((total, [, kills]) => total + Math.max(0, kills ?? 0), 0);
    const primalCoreTotal = Object.values(character.primalCoreBySpecies ?? {}).reduce((total, value) => total + Math.max(0, value ?? 0), 0);

    return {
      characterId: character.characterId,
      name,
      subtitle: catalogEntry?.subtitle ?? "",
      playstyle: CHARACTER_PLAYSTYLE[character.characterId] ?? "",
      masteryLevel: Math.max(1, character.masteryLevel ?? 1),
      masteryXp: Math.max(0, character.masteryXp ?? 0),
      masteryXpForCurrentLevel,
      masteryXpRequiredForNextLevel,
      unlockedSigilSlots: Math.max(1, Math.min(5, character.unlockedSigilSlots ?? 1)),
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
      masteryProgressPercent
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

  private resolveEquippedSigilForSlot(character: CharacterState, slotIndex: number): SigilInstance | null {
    const loadout = character.sigilLoadout;
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

  private resolveSigilInstanceIdForSlot(character: CharacterState, slotIndex: number): string | null {
    const loadout = character.sigilLoadout;
    if (!loadout) {
      return null;
    }

    if (slotIndex === 1) {
      return loadout.slot1?.instanceId ?? null;
    }

    if (slotIndex === 2) {
      return loadout.slot2?.instanceId ?? null;
    }

    if (slotIndex === 3) {
      return loadout.slot3?.instanceId ?? null;
    }

    if (slotIndex === 4) {
      return loadout.slot4?.instanceId ?? null;
    }

    if (slotIndex === 5) {
      return loadout.slot5?.instanceId ?? null;
    }

    return null;
  }

  private resolveMasteryRequirementForSlot(slotIndex: number): number {
    if (slotIndex <= 1) {
      return 1;
    }

    return (slotIndex - 1) * 10;
  }

  private toSigilInventoryRowViewModel(
    character: CharacterState,
    sigil: SigilInstance
  ): SigilInventoryRowViewModel {
    const slotIndex = Math.max(1, Math.min(5, sigil.slotIndex ?? 1));
    const unlockedSigilSlots = Math.max(1, character.unlockedSigilSlots ?? 1);
    const isUnlocked = slotIndex <= unlockedSigilSlots;
    const currentSlotSigilInstanceId = this.resolveSigilInstanceIdForSlot(character, slotIndex);
    const isEquippedInSelectedSlot = currentSlotSigilInstanceId === sigil.instanceId;
    const hasPrerequisite = slotIndex <= 1 || !!this.resolveSigilInstanceIdForSlot(character, slotIndex - 1);

    if (isEquippedInSelectedSlot) {
      return {
        sigil,
        canEquip: false,
        isEquippedInSelectedSlot: true,
        disabledReason: "Already equipped"
      };
    }

    if (!isUnlocked) {
      return {
        sigil,
        canEquip: false,
        isEquippedInSelectedSlot: false,
        disabledReason: `Locked - Mastery ${this.resolveMasteryRequirementForSlot(slotIndex)} required`
      };
    }

    if (!hasPrerequisite) {
      return {
        sigil,
        canEquip: false,
        isEquippedInSelectedSlot: false,
        disabledReason: `Requires slot ${slotIndex - 1} equipped`
      };
    }

    return {
      sigil,
      canEquip: true,
      isEquippedInSelectedSlot: false,
      disabledReason: null
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
