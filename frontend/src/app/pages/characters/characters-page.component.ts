import { Component, OnDestroy, OnInit } from "@angular/core";
import { RouterLink, ActivatedRoute, Router } from "@angular/router";
import { Subscription } from "rxjs";
import { type AccountState, type CharacterState } from "../../api/account-api.service";
import { AccountStore } from "../../account/account-store.service";

type CharacterRow = Readonly<{
  characterId: string;
  name: string;
  level: number;
  xp: number;
  isActive: boolean;
  equippedWeaponName: string;
  equippedArmorName: string;
  equippedRelicName: string;
}>;

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

  private routeCharacterId: string | null = null;
  private routeSubscription: Subscription | null = null;

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

    if (this.routeCharacterId && state.characters[this.routeCharacterId]) {
      return this.routeCharacterId;
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

  private toCharacterRow(character: CharacterState, account: AccountState): CharacterRow {
    return {
      characterId: character.characterId,
      name: character.name,
      level: character.level,
      xp: character.xp,
      isActive: account.activeCharacterId === character.characterId,
      equippedWeaponName: this.resolveEquippedItemName(character, "weapon"),
      equippedArmorName: this.resolveEquippedItemName(character, "armor"),
      equippedRelicName: this.resolveEquippedItemName(character, "relic")
    };
  }

  private resolveEquippedItemName(character: CharacterState, slot: "weapon" | "armor" | "relic"): string {
    const instanceId = slot === "weapon"
      ? character.equipment.weaponInstanceId
      : slot === "armor"
        ? character.equipment.armorInstanceId
        : character.equipment.relicInstanceId;
    if (!instanceId) {
      return "None";
    }

    const instance = character.inventory.equipmentInstances[instanceId];
    if (!instance) {
      return `${instanceId} (missing)`;
    }

    const itemDefinition = this.accountStore.catalogs().itemById[instance.definitionId];
    return itemDefinition?.displayName ?? instance.definitionId;
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

