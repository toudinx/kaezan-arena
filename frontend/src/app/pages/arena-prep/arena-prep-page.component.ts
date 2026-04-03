import { Component, HostListener, OnInit } from "@angular/core";
import { RouterLink } from "@angular/router";
import { Router } from "@angular/router";
import type { CharacterState } from "../../api/account-api.service";
import { AccountStore } from "../../account/account-store.service";
import {
  resolveCharacterDisplayName,
  resolveCharacterPortraitVisual,
  type CharacterPortraitTone
} from "../../shared/characters/character-visuals.helpers";

const ZONE_SELECTION_STORAGE_KEY = "kaezan_zone_selection_v1";
const ZONE_UNLOCK_LEVELS: ReadonlyArray<number> = [1, 21, 41, 61, 81];
const MAX_ZONE_INDEX = 5;

type ArenaPrepZoneOption = Readonly<{
  zoneIndex: number;
  unlockLevel: number;
  isUnlocked: boolean;
  isSelected: boolean;
  description: string;
}>;

interface StatRow {
  label: string;
  value: string;
  accent?: boolean;
}

const ZONE_DESCRIPTIONS: ReadonlyArray<string> = [
  "Starter grounds. Skirmish-level threats.",
  "Mid-range encounters. Balanced challenge.",
  "Tactical zone. Elites in rotation.",
  "High-pressure. Boss sub-waves.",
  "Maximum threat. Unrelenting assault."
];

@Component({
  selector: "app-arena-prep-page",
  standalone: true,
  imports: [RouterLink],
  templateUrl: "./arena-prep-page.component.html",
  styleUrl: "./arena-prep-page.component.css"
})
export class ArenaPrepPageComponent implements OnInit {
  selectedZoneIndex = 1;
  selectedCharacterId: string | null = null;
  isSwitchingCharacter = false;

  constructor(
    private readonly accountStore: AccountStore,
    private readonly router: Router
  ) {}

  async ngOnInit(): Promise<void> {
    this.selectedZoneIndex = this.readPersistedZoneSelection();
    try {
      await this.accountStore.load();
    } catch {
      // Render uses store error state.
    }

    this.syncSelectedZoneWithUnlockState();
    this.syncSelectedCharacterWithStore();
  }

  get isLoading(): boolean {
    return this.accountStore.isLoading();
  }

  get loadError(): string | null {
    return this.accountStore.error();
  }

  get selectedCharacter(): CharacterState | null {
    const state = this.accountStore.state();
    if (!state) {
      return null;
    }

    if (this.selectedCharacterId && state.characters[this.selectedCharacterId]) {
      return state.characters[this.selectedCharacterId];
    }

    const activeId = this.accountStore.activeCharacterId();
    if (activeId && state.characters[activeId]) {
      return state.characters[activeId];
    }

    return Object.values(state.characters)[0] ?? null;
  }

  get characterIds(): ReadonlyArray<string> {
    const state = this.accountStore.state();
    if (!state) {
      return [];
    }

    return Object.values(state.characters)
      .sort((left, right) => this.resolveCharacterDisplayName(left).localeCompare(this.resolveCharacterDisplayName(right), undefined, { sensitivity: "base" }))
      .map((character) => character.characterId);
  }

  get hasMultipleCharacters(): boolean {
    return this.characterIds.length > 1;
  }

  get activeCharacterName(): string {
    const character = this.selectedCharacter;
    if (!character) return "No Kaelis";
    return this.resolveCharacterDisplayName(character);
  }

  get activeCharacterSubtitle(): string {
    const character = this.selectedCharacter;
    if (!character) return "";
    return this.accountStore.catalogs().characterById[character.characterId]?.subtitle ?? "";
  }

  get activeCharacterLevel(): number {
    return Math.max(1, this.selectedCharacter?.masteryLevel ?? 1);
  }

  get activeCharacterPortraitTone(): CharacterPortraitTone {
    const character = this.selectedCharacter;
    if (!character) {
      return "slate";
    }

    return resolveCharacterPortraitVisual({
      characterId: character.characterId,
      displayName: this.activeCharacterName,
      context: "prerun"
    }).tone;
  }

  get activeCharacterImageUrl(): string | null {
    const character = this.selectedCharacter;
    if (!character) return null;
    const portrait = resolveCharacterPortraitVisual({
      characterId: character.characterId,
      displayName: this.activeCharacterName,
      context: "prerun"
    });
    return portrait.imageUrl ?? null;
  }

  get equippedWeaponName(): string {
    const character = this.selectedCharacter;
    if (!character) return "None";
    const instanceId = character.equipment.weaponInstanceId;
    if (!instanceId) return "None";
    const instance = character.inventory.equipmentInstances[instanceId];
    if (!instance) return `${instanceId} (missing)`;
    return this.accountStore.catalogs().itemById[instance.definitionId]?.displayName ?? instance.definitionId;
  }

  get unlockedZoneCount(): number {
    const raw = Math.floor(this.accountStore.state()?.unlockedZoneCount ?? 1);
    return Math.max(1, Math.min(MAX_ZONE_INDEX, raw));
  }

  get accountLevel(): number {
    return Math.max(1, Math.floor(this.accountStore.state()?.accountLevel ?? 1));
  }

  get statRows(): StatRow[] {
    return [
      { label: "Mastery", value: `LV. ${this.activeCharacterLevel}` },
      { label: "Weapon", value: this.equippedWeaponName },
      { label: "Zones", value: `${this.unlockedZoneCount} / ${MAX_ZONE_INDEX}`, accent: true },
      { label: "Account", value: `LV. ${this.accountLevel}` }
    ];
  }

  get zoneOptions(): ReadonlyArray<ArenaPrepZoneOption> {
    const options: ArenaPrepZoneOption[] = [];
    const unlockedZoneCount = this.unlockedZoneCount;
    const selectedZoneIndex = this.clampZoneIndex(this.selectedZoneIndex);

    for (let index = 1; index <= MAX_ZONE_INDEX; index += 1) {
      options.push({
        zoneIndex: index,
        unlockLevel: ZONE_UNLOCK_LEVELS[index - 1] ?? 1,
        isUnlocked: index <= unlockedZoneCount,
        isSelected: index === selectedZoneIndex,
        description: ZONE_DESCRIPTIONS[index - 1] ?? ""
      });
    }

    return options;
  }

  get canStartRun(): boolean {
    return !this.isLoading && !this.loadError && !!this.selectedCharacter && !this.isSwitchingCharacter;
  }

  get canSwitchCharacter(): boolean {
    return !this.isLoading && !this.isSwitchingCharacter && this.characterIds.length > 1;
  }

  get selectedZoneLabel(): string {
    return `Zone ${this.clampZoneIndex(this.selectedZoneIndex)}`;
  }

  get startRunQueryParams(): Readonly<{ zoneIndex: number }> {
    return { zoneIndex: this.clampZoneIndex(this.selectedZoneIndex) };
  }

  async onSelectCharacter(characterId: string): Promise<void> {
    const safeCharacterId = characterId?.trim() ?? "";
    if (!safeCharacterId || this.isSwitchingCharacter) {
      return;
    }

    const previousId = this.selectedCharacterId;
    this.selectedCharacterId = safeCharacterId;

    if (this.accountStore.activeCharacterId() === safeCharacterId) {
      return;
    }

    this.isSwitchingCharacter = true;
    try {
      await this.accountStore.setActiveCharacter(safeCharacterId);
      this.syncSelectedCharacterWithStore();
    } catch {
      this.selectedCharacterId = previousId;
    } finally {
      this.isSwitchingCharacter = false;
    }
  }

  cycleCharacter(direction: "prev" | "next"): void {
    const ids = this.characterIds;
    if (ids.length <= 1 || !this.canSwitchCharacter) {
      return;
    }

    const currentId = this.selectedCharacterId;
    const currentIndex = ids.findIndex((id) => id === currentId);
    const fallbackIndex = currentIndex >= 0 ? currentIndex : 0;
    const nextIndex = direction === "next"
      ? (fallbackIndex + 1) % ids.length
      : (fallbackIndex - 1 + ids.length) % ids.length;

    void this.onSelectCharacter(ids[nextIndex]);
  }

  onSelectZone(zoneIndex: number): void {
    const safeZoneIndex = this.clampZoneIndex(zoneIndex);
    if (safeZoneIndex > this.unlockedZoneCount) return;
    this.selectedZoneIndex = safeZoneIndex;
    this.persistZoneSelection(safeZoneIndex);
  }

  goBack(): void {
    this.router.navigateByUrl("/");
  }

  confirm(): void {
    if (!this.canStartRun) return;
    this.router.navigate(["/arena"], { queryParams: this.startRunQueryParams });
  }

  @HostListener("window:keydown", ["$event"])
  handleHotkeys(event: KeyboardEvent): void {
    const target = event.target as HTMLElement | null;
    if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;

    if (event.code === "ArrowLeft") {
      event.preventDefault();
      this.cycleCharacter("prev");
      return;
    }

    if (event.code === "ArrowRight") {
      event.preventDefault();
      this.cycleCharacter("next");
      return;
    }

    if (event.code === "Space") {
      if (!this.canStartRun) return;
      event.preventDefault();
      this.confirm();
      return;
    }

    const digit = this.digitFromCode(event.code);
    if (digit !== null && digit >= 1 && digit <= MAX_ZONE_INDEX) {
      const option = this.zoneOptions[digit - 1];
      if (option?.isUnlocked) this.onSelectZone(option.zoneIndex);
    }
  }

  private resolveCharacterDisplayName(character: CharacterState): string {
    const preferredName = this.accountStore.catalogs().characterById[character.characterId]?.displayName ?? character.name;
    return resolveCharacterDisplayName({
      characterId: character.characterId,
      preferredName
    });
  }

  private syncSelectedCharacterWithStore(): void {
    const state = this.accountStore.state();
    if (!state) {
      this.selectedCharacterId = null;
      return;
    }

    if (this.selectedCharacterId && state.characters[this.selectedCharacterId]) {
      return;
    }

    const activeId = this.accountStore.activeCharacterId();
    if (activeId && state.characters[activeId]) {
      this.selectedCharacterId = activeId;
      return;
    }

    this.selectedCharacterId = Object.values(state.characters)[0]?.characterId ?? null;
  }

  private digitFromCode(code: string): number | null {
    const map: Record<string, number> = {
      Digit1: 1,
      Numpad1: 1,
      Digit2: 2,
      Numpad2: 2,
      Digit3: 3,
      Numpad3: 3,
      Digit4: 4,
      Numpad4: 4,
      Digit5: 5,
      Numpad5: 5
    };
    return map[code] ?? null;
  }

  private syncSelectedZoneWithUnlockState(): void {
    const clampedSelectedZone = this.clampZoneIndex(this.selectedZoneIndex);
    const unlockedZoneCount = this.unlockedZoneCount;
    if (clampedSelectedZone <= unlockedZoneCount) {
      this.selectedZoneIndex = clampedSelectedZone;
      return;
    }
    this.selectedZoneIndex = unlockedZoneCount;
    this.persistZoneSelection(this.selectedZoneIndex);
  }

  private readPersistedZoneSelection(): number {
    if (typeof window === "undefined" || typeof window.localStorage === "undefined") return 1;
    const raw = window.localStorage.getItem(ZONE_SELECTION_STORAGE_KEY);
    if (!raw) return 1;
    const parsed = Number.parseInt(raw, 10);
    if (!Number.isFinite(parsed)) return 1;
    return this.clampZoneIndex(parsed);
  }

  private persistZoneSelection(zoneIndex: number): void {
    if (typeof window === "undefined" || typeof window.localStorage === "undefined") return;
    window.localStorage.setItem(ZONE_SELECTION_STORAGE_KEY, String(this.clampZoneIndex(zoneIndex)));
  }

  private clampZoneIndex(zoneIndex: number): number {
    if (!Number.isFinite(zoneIndex)) return 1;
    return Math.max(1, Math.min(MAX_ZONE_INDEX, Math.floor(zoneIndex)));
  }
}
