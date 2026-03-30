import { Component, OnInit } from "@angular/core";
import { RouterLink } from "@angular/router";
import type { CharacterState } from "../../api/account-api.service";
import { AccountStore } from "../../account/account-store.service";
import type { RunResultV1 } from "../../shared/run-results/run-result-logger";

const RUN_RESULT_STORAGE_KEY = "kaezan_run_results_v1";
const KILL_MILESTONE_STEP = 25;

const CHARACTER_PORTRAIT_COLORS: Readonly<Record<string, string>> = {
  "character:kina": "amber",
  "character:ranged_prototype": "teal",
  "kaelis_01": "purple",
  "kaelis_02": "green"
};

function resolveHubKitType(fixedWeaponNames: ReadonlyArray<string>): { label: string; badge: "melee" | "ranged" | "unknown" } {
  if (fixedWeaponNames.includes("Exori Min")) return { label: "Melee Kit", badge: "melee" };
  if (fixedWeaponNames.includes("Sigil Bolt")) return { label: "Ranged Kit", badge: "ranged" };
  return { label: "Unknown Kit", badge: "unknown" };
}

function formatMs(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSec / 60);
  const seconds = totalSec % 60;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

function formatTokenId(id: string): string {
  return id
    .split("_")
    .map(token => token.length > 0 ? token[0].toUpperCase() + token.slice(1) : token)
    .join(" ");
}

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
    const char = this.activeCharacter;
    if (!char) return "No active character";
    const catalogEntry = this.accountStore.catalogs().characterById[char.characterId];
    return catalogEntry?.displayName ?? char.name;
  }

  get activeCharacterPortraitColor(): string {
    const charId = this.activeCharacter?.characterId ?? "";
    return CHARACTER_PORTRAIT_COLORS[charId] ?? "gray";
  }

  get activeCharacterFixedWeaponNames(): ReadonlyArray<string> {
    const charId = this.activeCharacter?.characterId ?? "";
    return this.accountStore.catalogs().characterById[charId]?.fixedWeaponNames ?? [];
  }

  get activeCharacterKitTypeLabel(): string {
    return resolveHubKitType(this.activeCharacterFixedWeaponNames).label;
  }

  get activeCharacterKitBadge(): "melee" | "ranged" | "unknown" {
    return resolveHubKitType(this.activeCharacterFixedWeaponNames).badge;
  }

  get activeCharacterXpProgressPercent(): number {
    const char = this.activeCharacter;
    if (!char) return 0;
    const threshold = Math.max(1, char.level * 100);
    return Math.min(100, Math.max(0, (char.xp / threshold) * 100));
  }

  get echoFragmentsBalance(): number {
    return Math.max(0, this.accountStore.state()?.echoFragmentsBalance ?? 0);
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

  get bestiaryTopRows(): ReadonlyArray<Readonly<{
    speciesName: string;
    killsTotal: number;
    killsToNext: number;
    progressPercent: number;
  }>> {
    const char = this.activeCharacter;
    if (!char) return [];

    const speciesById = this.accountStore.catalogs().speciesById;
    return Object.entries(char.bestiaryKillsBySpecies ?? {})
      .map(([speciesId, kills]) => {
        const killsTotal = Math.max(0, kills ?? 0);
        const tier = Math.floor(killsTotal / KILL_MILESTONE_STEP);
        const nextMilestone = Math.max(KILL_MILESTONE_STEP, (tier + 1) * KILL_MILESTONE_STEP);
        const previousMilestone = Math.max(0, nextMilestone - KILL_MILESTONE_STEP);
        const progressPercent = Math.max(0, Math.min(100, ((killsTotal - previousMilestone) / KILL_MILESTONE_STEP) * 100));
        const speciesName = speciesById[speciesId]?.displayName ?? formatTokenId(speciesId);
        return { speciesName, killsTotal, killsToNext: nextMilestone - killsTotal, progressPercent };
      })
      .filter(row => row.killsTotal > 0)
      .sort((a, b) => b.killsTotal - a.killsTotal)
      .slice(0, 3);
  }

  get bestiaryNextMilestone(): Readonly<{ speciesName: string; killsToNext: number }> | null {
    const char = this.activeCharacter;
    if (!char) return null;

    const speciesById = this.accountStore.catalogs().speciesById;
    let best: { speciesName: string; killsToNext: number } | null = null;

    for (const [speciesId, kills] of Object.entries(char.bestiaryKillsBySpecies ?? {})) {
      const killsTotal = Math.max(0, kills ?? 0);
      if (killsTotal === 0) continue;
      const tier = Math.floor(killsTotal / KILL_MILESTONE_STEP);
      const nextMilestone = Math.max(KILL_MILESTONE_STEP, (tier + 1) * KILL_MILESTONE_STEP);
      const killsToNext = nextMilestone - killsTotal;
      const speciesName = speciesById[speciesId]?.displayName ?? formatTokenId(speciesId);
      if (!best || killsToNext < best.killsToNext) {
        best = { speciesName, killsToNext };
      }
    }
    return best;
  }

  get hasLastRunSummary(): boolean {
    return this.lastRunSummary !== null;
  }

  get lastRunDurationLabel(): string {
    return formatMs(this.lastRunSummary?.durationMs ?? 0);
  }

  get lastRunEndReasonLabel(): string {
    const reason = this.lastRunSummary?.endReason ?? "";
    if (reason.includes("victory")) return "Victory";
    if (reason.includes("defeat") || reason.includes("death") || reason.includes("killed")) return "Defeat";
    if (!reason || reason === "unknown") return "Unknown";
    return formatTokenId(reason.replace(/_/g, " ").trim());
  }

  get lastRunEndReasonClass(): "victory" | "defeat" | "unknown" {
    const reason = this.lastRunSummary?.endReason ?? "";
    if (reason.includes("victory")) return "victory";
    if (reason.includes("defeat") || reason.includes("death") || reason.includes("killed")) return "defeat";
    return "unknown";
  }

  get lastRunCardsFormatted(): ReadonlyArray<string> {
    return (this.lastRunSummary?.cardsChosen ?? []).map(formatTokenId);
  }

  private resolveEquippedName(slot: "weapon" | "armor" | "relic"): string {
    const character = this.activeCharacter;
    if (!character) return "None";

    const instanceId = slot === "weapon"
      ? character.equipment.weaponInstanceId
      : slot === "armor"
        ? character.equipment.armorInstanceId
        : character.equipment.relicInstanceId;
    if (!instanceId) return "None";

    const instance = character.inventory.equipmentInstances[instanceId];
    if (!instance) return `${instanceId} (missing)`;

    return this.accountStore.catalogs().itemById[instance.definitionId]?.displayName ?? instance.definitionId;
  }

  private readLastRunSummary(): RunResultV1 | null {
    if (typeof window === "undefined" || typeof window.localStorage === "undefined") {
      return null;
    }

    const raw = window.localStorage.getItem(RUN_RESULT_STORAGE_KEY);
    if (!raw) return null;

    try {
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed) || parsed.length === 0) return null;

      const candidate = parsed[parsed.length - 1] as Partial<RunResultV1> | null;
      if (!candidate || candidate.schemaVersion !== 1 || typeof candidate.battleSeed !== "number") {
        return null;
      }

      return candidate as RunResultV1;
    } catch {
      return null;
    }
  }
}
