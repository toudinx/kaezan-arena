import { Component, OnInit } from "@angular/core";
import { RouterLink } from "@angular/router";
import type { CharacterState } from "../../api/account-api.service";
import { AccountStore } from "../../account/account-store.service";
import type { RunResultV1 } from "../../shared/run-results/run-result-logger";

const RUN_RESULT_STORAGE_KEY = "kaezan_run_results_v1";

type CurrencyRow = Readonly<{
  label: string;
  amount: number;
}>;

@Component({
  selector: "app-home-page",
  standalone: true,
  imports: [RouterLink],
  templateUrl: "./home-page.component.html",
  styleUrl: "./home-page.component.css"
})
export class HomePageComponent implements OnInit {
  lastRunSummary: RunResultV1 | null = null;

  constructor(private readonly accountStore: AccountStore) {}

  async ngOnInit(): Promise<void> {
    try {
      await this.accountStore.load();
    } catch {
      // Render uses store error state.
    }

    this.lastRunSummary = this.readLastRunSummary();
  }

  get accountId(): string {
    return this.accountStore.accountId();
  }

  get isLoading(): boolean {
    return this.accountStore.isLoading();
  }

  get loadError(): string | null {
    return this.accountStore.error();
  }

  get activeCharacter(): CharacterState | null {
    return this.accountStore.activeCharacter();
  }

  get hasActiveCharacter(): boolean {
    return !!this.activeCharacter;
  }

  get activeCharacterName(): string {
    return this.activeCharacter?.name ?? "No active character";
  }

  get activeCharacterId(): string {
    return this.activeCharacter?.characterId ?? "";
  }

  get keyStats(): ReadonlyArray<Readonly<{ label: string; value: string }>> {
    const character = this.activeCharacter;
    if (!character) {
      return [];
    }

    const inventoryEquipmentCount = Object.keys(character.inventory.equipmentInstances ?? {}).length;
    const bestiaryKillsTotal = Object.values(character.bestiaryKillsBySpecies ?? {})
      .reduce((sum, value) => sum + Math.max(0, value ?? 0), 0);

    return [
      { label: "Level", value: String(Math.max(1, character.level)) },
      { label: "XP", value: String(Math.max(0, character.xp)) },
      { label: "Inventory Equipment", value: String(inventoryEquipmentCount) },
      { label: "Bestiary Kills", value: String(bestiaryKillsTotal) }
    ];
  }

  get equippedWeaponName(): string {
    return this.resolveEquippedName("weapon");
  }

  get equippedArmorName(): string {
    return this.resolveEquippedName("armor");
  }

  get equippedRelicName(): string {
    return this.resolveEquippedName("relic");
  }

  get currencyRows(): ReadonlyArray<CurrencyRow> {
    const rows: CurrencyRow[] = [
      {
        label: "Echo Fragments",
        amount: Math.max(0, this.accountStore.state()?.echoFragmentsBalance ?? 0)
      },
      {
        label: "Primal Core (Total)",
        amount: this.totalPrimalCore
      }
    ];

    for (const entry of this.materialCurrencyRows) {
      rows.push(entry);
    }

    return rows;
  }

  get materialCurrencyRows(): ReadonlyArray<CurrencyRow> {
    const character = this.activeCharacter;
    if (!character) {
      return [];
    }

    const itemById = this.accountStore.catalogs().itemById;
    return Object.entries(character.inventory.materialStacks ?? {})
      .map(([itemId, quantity]) => ({
        label: itemById[itemId]?.displayName ?? this.formatItemId(itemId),
        amount: Math.max(0, Math.floor(quantity ?? 0))
      }))
      .filter((row) => row.amount > 0)
      .sort((left, right) => left.label.localeCompare(right.label, undefined, { sensitivity: "base" }));
  }

  get totalPrimalCore(): number {
    const character = this.activeCharacter;
    if (!character) {
      return 0;
    }

    return Object.values(character.primalCoreBySpecies ?? {})
      .reduce((sum, value) => sum + Math.max(0, Math.floor(value ?? 0)), 0);
  }

  get hasLastRunSummary(): boolean {
    return this.lastRunSummary !== null;
  }

  get lastRunRecordedAtLabel(): string {
    const run = this.lastRunSummary;
    if (!run?.recordedAtIso) {
      return "";
    }

    const date = new Date(run.recordedAtIso);
    if (!Number.isFinite(date.getTime())) {
      return run.recordedAtIso;
    }

    return date.toLocaleString();
  }

  private resolveEquippedName(slot: "weapon" | "armor" | "relic"): string {
    const character = this.activeCharacter;
    if (!character) {
      return "None";
    }

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

    return this.accountStore.catalogs().itemById[instance.definitionId]?.displayName ?? instance.definitionId;
  }

  private readLastRunSummary(): RunResultV1 | null {
    if (typeof window === "undefined" || typeof window.localStorage === "undefined") {
      return null;
    }

    const raw = window.localStorage.getItem(RUN_RESULT_STORAGE_KEY);
    if (!raw) {
      return null;
    }

    try {
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed) || parsed.length === 0) {
        return null;
      }

      const candidate = parsed[parsed.length - 1] as Partial<RunResultV1> | null;
      if (!candidate || candidate.schemaVersion !== 1 || typeof candidate.battleSeed !== "number") {
        return null;
      }

      return candidate as RunResultV1;
    } catch {
      return null;
    }
  }

  private formatItemId(itemId: string): string {
    return itemId
      .replace(/^[a-z]+\./i, "")
      .split("_")
      .filter((part) => part.length > 0)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ");
  }
}
