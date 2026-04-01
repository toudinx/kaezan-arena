import { Component, OnInit } from "@angular/core";
import { RouterLink } from "@angular/router";
import type { CharacterState } from "../../api/account-api.service";
import { AccountStore } from "../../account/account-store.service";
import {
  resolveCharacterPortraitVisual,
  type CharacterPortraitVisual
} from "../../shared/characters/character-visuals.helpers";
import type { RunResultV1 } from "../../shared/run-results/run-result-logger";
import {
  resolveKitBadgeForSkills,
  resolveSkillPresentation,
  type SkillVisualFamily,
  type SkillVisualTier
} from "../../shared/skills/skill-presentation.helpers";

const RUN_RESULT_STORAGE_KEY = "kaezan_run_results_v1";
const RANK_THRESHOLDS: ReadonlyArray<number> = [0, 10, 30, 60, 100];
const MAX_RANK = RANK_THRESHOLDS.length;

function computeRank(killsTotal: number): number {
  const kills = Math.max(0, killsTotal);
  let rank = 1;
  for (let i = RANK_THRESHOLDS.length - 1; i >= 0; i--) {
    if (kills >= RANK_THRESHOLDS[i]) {
      rank = i + 1;
      break;
    }
  }
  return rank;
}

type HomeFixedWeaponViewModel = Readonly<{
  skillId: string | null;
  label: string;
  iconGlyph: string;
  family: SkillVisualFamily;
  tier: SkillVisualTier;
}>;

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
  private readonly portraitImageFailures = new Set<string>();

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

  get activeCharacterPortrait(): CharacterPortraitVisual {
    return resolveCharacterPortraitVisual({
      characterId: this.activeCharacter?.characterId ?? null,
      displayName: this.activeCharacterName
    });
  }

  get activeCharacterFixedWeaponNames(): ReadonlyArray<string> {
    return this.activeCharacterFixedWeapons.map((weapon) => weapon.label);
  }

  get activeCharacterFixedWeapons(): ReadonlyArray<HomeFixedWeaponViewModel> {
    const charId = this.activeCharacter?.characterId ?? "";
    const catalogEntry = this.accountStore.catalogs().characterById[charId];
    const fixedWeaponIds = catalogEntry?.fixedWeaponIds ?? [];
    const fixedWeaponNames = catalogEntry?.fixedWeaponNames ?? [];
    const size = Math.max(fixedWeaponIds.length, fixedWeaponNames.length);
    const rows: HomeFixedWeaponViewModel[] = [];

    for (let index = 0; index < size; index += 1) {
      const skillId = fixedWeaponIds[index] ?? null;
      const displayName = fixedWeaponNames[index] ?? null;
      const presentation = resolveSkillPresentation({
        skillId,
        displayName,
        fallbackLabel: displayName ?? skillId ?? `Skill ${index + 1}`
      });
      rows.push({
        skillId: presentation.canonicalId ?? skillId,
        label: presentation.label,
        iconGlyph: presentation.iconGlyph,
        family: presentation.family,
        tier: presentation.tier
      });
    }

    return rows;
  }

  get activeCharacterKitTypeLabel(): string {
    return this.toKitLabel(this.activeCharacterKitBadge);
  }

  get activeCharacterKitBadge(): "melee" | "ranged" | "unknown" {
    return resolveKitBadgeForSkills(
      this.activeCharacterFixedWeapons.map((weapon) => ({
        skillId: weapon.skillId,
        displayName: weapon.label
      }))
    );
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
        const rank = computeRank(killsTotal);
        const isMaxRank = rank >= MAX_RANK;
        const nextMilestone = isMaxRank ? RANK_THRESHOLDS[MAX_RANK - 1] : RANK_THRESHOLDS[rank];
        const currentRankStart = RANK_THRESHOLDS[rank - 1];
        const bandSize = isMaxRank ? 1 : (nextMilestone - currentRankStart);
        const progressInBand = isMaxRank ? 1 : Math.max(0, killsTotal - currentRankStart);
        const progressPercent = Math.min(100, Math.max(0, (progressInBand / bandSize) * 100));
        const speciesName = speciesById[speciesId]?.displayName ?? formatTokenId(speciesId);
        return { speciesName, killsTotal, killsToNext: isMaxRank ? 0 : Math.max(0, nextMilestone - killsTotal), progressPercent };
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
      const rank = computeRank(killsTotal);
      const isMaxRank = rank >= MAX_RANK;
      if (isMaxRank) continue;
      const nextMilestone = RANK_THRESHOLDS[rank];
      const killsToNext = Math.max(0, nextMilestone - killsTotal);
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

  get lastRunXpGained(): number {
    return this.lastRunSummary?.xpTotalGained ?? 0;
  }

  get lastRunEchoFragmentsDelta(): number {
    return this.lastRunSummary?.echoFragmentsDelta ?? 0;
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

  isActiveCharacterPortraitImageFailed(): boolean {
    const activeCharacterId = this.activeCharacter?.characterId ?? "";
    if (!activeCharacterId) {
      return false;
    }

    return this.portraitImageFailures.has(activeCharacterId);
  }

  onActiveCharacterPortraitImageError(): void {
    const activeCharacterId = this.activeCharacter?.characterId ?? "";
    if (!activeCharacterId) {
      return;
    }

    this.portraitImageFailures.add(activeCharacterId);
  }

  private resolveEquippedName(slot: "weapon"): string {
    const character = this.activeCharacter;
    if (!character) return "None";

    const instanceId = character.equipment.weaponInstanceId;
    if (!instanceId) return "None";

    const instance = character.inventory.equipmentInstances[instanceId];
    if (!instance) return `${instanceId} (missing)`;

    return this.accountStore.catalogs().itemById[instance.definitionId]?.displayName ?? instance.definitionId;
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
