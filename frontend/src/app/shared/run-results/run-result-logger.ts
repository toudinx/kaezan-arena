import type { CharacterState, DropEvent } from "../../api/account-api.service";
import type { StartBattleResponse, StepBattleResponse } from "../../api/battle-api.service";

const RUN_RESULT_STORAGE_KEY = "kaezan_run_results_v1";
const RUN_RESULT_STORAGE_CAP = 30;

type SnapshotLike = StartBattleResponse | StepBattleResponse;

export type RunResultFinalizeMetrics = Readonly<{
  healingDoneTotal: number;
  echoFragmentsDelta: number;
}>;

export type RunResultV1 = Readonly<{
  schemaVersion: 1;
  recordedAtIso: string;
  battleSeed: number;
  stepDeltaMs: number;
  durationMs: number;
  endReason: string;
  runLevelFinal: number;
  xpTotalGained: number;
  killsTotal: number;
  eliteKills: number;
  chestsOpened: number;
  cardsChosen: string[];
  playerMinHp: number;
  playerMaxHpObserved: number;
  playerMinShield: number;
  damageDealtTotal: number;
  damageTakenTotal: number;
  healingDoneTotal: number;
  drops: DropEvent[];
  echoFragmentsDelta: number;
  itemsAwarded: Array<Readonly<{ itemId: string; quantity: number }>>;
  speciesCores: Readonly<{
    dropsBySpecies: Record<string, number>;
    totalsBySpecies: Record<string, number>;
  }>;
}>;

type ActiveRunState = {
  battleSeed: number;
  stepDeltaMs: number;
  cardsChosen: string[];
  playerMinHp: number;
  playerMaxHpObserved: number;
  playerMinShield: number;
  drops: DropEvent[];
  itemQuantities: Map<string, number>;
  speciesCoreDrops: Map<string, number>;
  speciesCoreTotals: Record<string, number>;
  killsTotal: number;
  eliteKillsTotal: number;
  chestsOpenedTotal: number;
  xpGained: number;
  damageDealtTotal: number;
  damageTakenTotal: number;
};

export class RunResultLogger {
  private activeRun: ActiveRunState | null = null;
  private lastFinalized: RunResultV1 | null = null;

  startRun(params: Readonly<{ battleSeed: number; stepDeltaMs: number; snapshot?: SnapshotLike | null }>): void {
    this.activeRun = {
      battleSeed: Math.max(0, Math.floor(params.battleSeed)),
      stepDeltaMs: Math.max(1, Math.floor(params.stepDeltaMs)),
      cardsChosen: [],
      playerMinHp: Number.POSITIVE_INFINITY,
      playerMaxHpObserved: 0,
      playerMinShield: Number.POSITIVE_INFINITY,
      drops: [],
      itemQuantities: new Map<string, number>(),
      speciesCoreDrops: new Map<string, number>(),
      speciesCoreTotals: {},
      killsTotal: 0,
      eliteKillsTotal: 0,
      chestsOpenedTotal: 0,
      xpGained: 0,
      damageDealtTotal: 0,
      damageTakenTotal: 0
    };

    if (params.snapshot) {
      this.recordStep(params.snapshot);
    }
  }

  recordStep(snapshot: SnapshotLike): void {
    const run = this.activeRun;
    if (!run) {
      return;
    }

    const record: Record<string, unknown> = this.readRecord(snapshot) ?? {};
    const snapshotSeed = this.readNumber(record["seed"]);
    if (snapshotSeed !== null) {
      run.battleSeed = Math.max(0, Math.floor(snapshotSeed));
    }

    const snapshotStepDeltaMs = this.readNumber(record["stepDeltaMs"]);
    if (snapshotStepDeltaMs !== null) {
      run.stepDeltaMs = Math.max(1, Math.floor(snapshotStepDeltaMs));
    }

    const actors = Array.isArray(record["actors"]) ? record["actors"] : [];
    const player = actors
      .map((entry) => this.readRecord(entry))
      .find((actor) => this.readString(actor?.["kind"]) === "player");
    if (!player) {
      return;
    }

    const hp = this.readNumber(player["hp"]);
    if (hp !== null) {
      run.playerMinHp = Math.min(run.playerMinHp, Math.max(0, Math.floor(hp)));
    }

    const maxHp = this.readNumber(player["maxHp"]);
    if (maxHp !== null) {
      run.playerMaxHpObserved = Math.max(run.playerMaxHpObserved, Math.max(0, Math.floor(maxHp)));
    } else if (hp !== null) {
      run.playerMaxHpObserved = Math.max(run.playerMaxHpObserved, Math.max(0, Math.floor(hp)));
    }

    const shield = this.readNumber(player["shield"]);
    if (shield !== null) {
      run.playerMinShield = Math.min(run.playerMinShield, Math.max(0, Math.floor(shield)));
    }

    const kills = this.readNumber(record["totalKills"]);
    if (kills !== null) run.killsTotal = Math.max(0, Math.floor(kills));

    const eliteKills = this.readNumber(record["eliteKills"]);
    if (eliteKills !== null) run.eliteKillsTotal = Math.max(0, Math.floor(eliteKills));

    const chestsOpened = this.readNumber(record["chestsOpened"]);
    if (chestsOpened !== null) run.chestsOpenedTotal = Math.max(0, Math.floor(chestsOpened));

    const playerActorId = this.readString(player["actorId"]);
    const eventsValue = record["events"];
    if (Array.isArray(eventsValue)) {
      for (const rawEvent of eventsValue) {
        const ev = this.readRecord(rawEvent);
        if (!ev) continue;
        const evType = this.readString(ev["type"]);

        if (evType === "xp_gained") {
          const amt = this.readNumber(ev["amount"]);
          if (amt !== null && amt > 0) run.xpGained += Math.floor(amt);
        }

        if (evType === "damage_number") {
          const dmg = this.readNumber(ev["damageAmount"]);
          const targetId = this.readString(ev["targetEntityId"]);
          const sourceId = this.readString(ev["sourceEntityId"]) ?? this.readString(ev["attackerEntityId"]);
          if (dmg === null || dmg <= 0 || !targetId) continue;
          const amount = Math.floor(dmg);
          if (playerActorId && targetId === playerActorId && sourceId !== playerActorId) {
            run.damageTakenTotal += amount;
          } else if (playerActorId && targetId !== playerActorId) {
            run.damageDealtTotal += amount;
          }
        }
      }
    }
  }

  recordCardChosen(cardId: string): void {
    const run = this.activeRun;
    const normalized = this.readString(cardId);
    if (!run || !normalized) {
      return;
    }

    run.cardsChosen.push(normalized);
  }

  recordAwardDrops(awarded: ReadonlyArray<DropEvent> | null | undefined, character: CharacterState | null = null): void {
    const run = this.activeRun;
    if (!run) {
      return;
    }

    if (!awarded || awarded.length === 0) {
      if (character) {
        run.speciesCoreTotals = this.normalizeSpeciesCoreTotals(character.primalCoreBySpecies);
      }
      return;
    }

    for (const drop of awarded) {
      run.drops.push(drop);
      const quantity = Math.max(0, Math.floor(drop.quantity ?? 0));
      if (quantity <= 0) {
        continue;
      }

      if (drop.rewardKind === "item") {
        const itemId = this.readString(drop.itemId) ?? "unknown_item";
        run.itemQuantities.set(itemId, (run.itemQuantities.get(itemId) ?? 0) + quantity);
      }

      if (drop.rewardKind === "primal_core") {
        const species = this.readString(drop.species) ?? "unknown_species";
        run.speciesCoreDrops.set(species, (run.speciesCoreDrops.get(species) ?? 0) + quantity);
      }
    }

    if (character) {
      run.speciesCoreTotals = this.normalizeSpeciesCoreTotals(character.primalCoreBySpecies);
    }
  }

  finalizeIfEnded(snapshot: SnapshotLike, metrics: RunResultFinalizeMetrics): RunResultV1 | null {
    const run = this.activeRun;
    if (!run) {
      return null;
    }

    const record: Record<string, unknown> = this.readRecord(snapshot) ?? {};
    const snapshotIsRunEnded = this.readBoolean(record["isRunEnded"]);
    const snapshotIsGameOver = this.readBoolean(record["isGameOver"]);
    const battleStatus = this.readString(record["battleStatus"]);
    const isTerminalStatus = battleStatus === "defeat" || battleStatus === "victory";
    const isTerminal = snapshotIsRunEnded === true || snapshotIsGameOver === true || isTerminalStatus;
    if (!isTerminal) {
      return null;
    }

    const result: RunResultV1 = {
      schemaVersion: 1,
      recordedAtIso: new Date().toISOString(),
      battleSeed: run.battleSeed,
      stepDeltaMs: run.stepDeltaMs,
      durationMs: Math.max(0, Math.floor(this.readNumber(record["runTimeMs"]) ?? 0)),
      endReason: this.readString(record["runEndReason"]) ??
        this.readString(record["endReason"]) ??
        battleStatus ??
        "unknown",
      runLevelFinal: Math.max(1, Math.floor(this.readNumber(record["runLevel"]) ?? 1)),
      xpTotalGained: Math.max(0, run.xpGained),
      killsTotal: Math.max(0, run.killsTotal),
      eliteKills: Math.max(0, run.eliteKillsTotal),
      chestsOpened: Math.max(0, run.chestsOpenedTotal),
      cardsChosen: [...run.cardsChosen],
      playerMinHp: Number.isFinite(run.playerMinHp) ? Math.max(0, Math.floor(run.playerMinHp)) : 0,
      playerMaxHpObserved: Math.max(0, Math.floor(run.playerMaxHpObserved)),
      playerMinShield: Number.isFinite(run.playerMinShield) ? Math.max(0, Math.floor(run.playerMinShield)) : 0,
      damageDealtTotal: Math.max(0, run.damageDealtTotal),
      damageTakenTotal: Math.max(0, run.damageTakenTotal),
      healingDoneTotal: Math.max(0, Math.floor(metrics.healingDoneTotal)),
      drops: [...run.drops],
      echoFragmentsDelta: Math.floor(metrics.echoFragmentsDelta),
      itemsAwarded: Array.from(run.itemQuantities.entries())
        .map(([itemId, quantity]) => ({ itemId, quantity }))
        .sort((left, right) => left.itemId.localeCompare(right.itemId)),
      speciesCores: {
        dropsBySpecies: this.mapToSortedRecord(run.speciesCoreDrops),
        totalsBySpecies: this.normalizeSpeciesCoreTotals(run.speciesCoreTotals)
      }
    };

    this.lastFinalized = result;
    this.activeRun = null;
    this.persistResult(result);
    console.log("RUN_RESULT_V1", JSON.stringify(result, null, 2));
    return result;
  }

  serializeLastResult(): string | null {
    const lastResult = this.lastFinalized ?? this.getLastStoredResult();
    if (!lastResult) {
      return null;
    }

    return JSON.stringify(lastResult, null, 2);
  }

  serializeAllResults(): string | null {
    const stored = this.getStoredResults();
    if (stored.length === 0) {
      return null;
    }

    return JSON.stringify(stored, null, 2);
  }

  getAllResults(): RunResultV1[] {
    return this.getStoredResults();
  }

  private persistResult(result: RunResultV1): void {
    const existing = this.getStoredResults();
    const next = [...existing, result].slice(-RUN_RESULT_STORAGE_CAP);
    this.writeStoredResults(next);
  }

  private getLastStoredResult(): RunResultV1 | null {
    const stored = this.getStoredResults();
    if (stored.length === 0) {
      return null;
    }

    return stored[stored.length - 1];
  }

  private getStoredResults(): RunResultV1[] {
    if (typeof window === "undefined" || typeof window.localStorage === "undefined") {
      return [];
    }

    const raw = window.localStorage.getItem(RUN_RESULT_STORAGE_KEY);
    if (!raw) {
      return [];
    }

    try {
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) {
        return [];
      }

      return parsed
        .map((entry) => this.readRecord(entry))
        .filter((entry): entry is Record<string, unknown> => entry !== null)
        .filter((entry) => this.readNumber(entry["schemaVersion"]) === 1)
        .map((entry) => this.normalizeStoredResult(entry));
    } catch {
      return [];
    }
  }

  private writeStoredResults(results: ReadonlyArray<RunResultV1>): void {
    if (typeof window === "undefined" || typeof window.localStorage === "undefined") {
      return;
    }

    try {
      window.localStorage.setItem(RUN_RESULT_STORAGE_KEY, JSON.stringify(results));
    } catch {
      // Ignore storage quota/availability errors for debug logging.
    }
  }

  private mapToSortedRecord(values: ReadonlyMap<string, number>): Record<string, number> {
    const next: Record<string, number> = {};
    const entries = Array.from(values.entries()).sort((left, right) => left[0].localeCompare(right[0]));
    for (const [key, value] of entries) {
      next[key] = Math.max(0, Math.floor(value));
    }

    return next;
  }

  private normalizeSpeciesCoreTotals(value: unknown): Record<string, number> {
    const record = this.readRecord(value);
    if (!record) {
      return {};
    }

    const normalized: Record<string, number> = {};
    const entries = Object.entries(record).sort((left, right) => left[0].localeCompare(right[0]));
    for (const [species, quantity] of entries) {
      const numberValue = this.readNumber(quantity);
      if (numberValue === null) {
        continue;
      }

      normalized[species] = Math.max(0, Math.floor(numberValue));
    }

    return normalized;
  }

  private normalizeStoredResult(entry: Record<string, unknown>): RunResultV1 {
    const speciesCoresRaw = this.readRecord(entry["speciesCores"]);
    return {
      schemaVersion: 1,
      recordedAtIso: this.readString(entry["recordedAtIso"]) ?? new Date(0).toISOString(),
      battleSeed: Math.max(0, Math.floor(this.readNumber(entry["battleSeed"]) ?? 0)),
      stepDeltaMs: Math.max(1, Math.floor(this.readNumber(entry["stepDeltaMs"]) ?? 250)),
      durationMs: Math.max(0, Math.floor(this.readNumber(entry["durationMs"]) ?? 0)),
      endReason: this.readString(entry["endReason"]) ?? "unknown",
      runLevelFinal: Math.max(1, Math.floor(this.readNumber(entry["runLevelFinal"]) ?? 1)),
      xpTotalGained: Math.max(0, Math.floor(this.readNumber(entry["xpTotalGained"]) ?? 0)),
      killsTotal: Math.max(0, Math.floor(this.readNumber(entry["killsTotal"]) ?? 0)),
      eliteKills: Math.max(0, Math.floor(this.readNumber(entry["eliteKills"]) ?? 0)),
      chestsOpened: Math.max(0, Math.floor(this.readNumber(entry["chestsOpened"]) ?? 0)),
      cardsChosen: Array.isArray(entry["cardsChosen"])
        ? (entry["cardsChosen"] as unknown[]).filter((c): c is string => typeof c === "string")
        : [],
      playerMinHp: Math.max(0, Math.floor(this.readNumber(entry["playerMinHp"]) ?? 0)),
      playerMaxHpObserved: Math.max(0, Math.floor(this.readNumber(entry["playerMaxHpObserved"]) ?? 0)),
      playerMinShield: Math.max(0, Math.floor(this.readNumber(entry["playerMinShield"]) ?? 0)),
      damageDealtTotal: Math.max(0, Math.floor(this.readNumber(entry["damageDealtTotal"]) ?? 0)),
      damageTakenTotal: Math.max(0, Math.floor(this.readNumber(entry["damageTakenTotal"]) ?? 0)),
      healingDoneTotal: Math.max(0, Math.floor(this.readNumber(entry["healingDoneTotal"]) ?? 0)),
      drops: Array.isArray(entry["drops"]) ? (entry["drops"] as DropEvent[]) : [],
      echoFragmentsDelta: Math.floor(this.readNumber(entry["echoFragmentsDelta"]) ?? 0),
      itemsAwarded: Array.isArray(entry["itemsAwarded"])
        ? (entry["itemsAwarded"] as Array<Readonly<{ itemId: string; quantity: number }>>)
        : [],
      speciesCores: {
        dropsBySpecies: this.readRecord(speciesCoresRaw?.["dropsBySpecies"]) as Record<string, number> ?? {},
        totalsBySpecies: this.readRecord(speciesCoresRaw?.["totalsBySpecies"]) as Record<string, number> ?? {}
      }
    };
  }

  private readString(value: unknown): string | null {
    return typeof value === "string" && value.trim().length > 0 ? value : null;
  }

  private readNumber(value: unknown): number | null {
    return typeof value === "number" && Number.isFinite(value) ? value : null;
  }

  private readBoolean(value: unknown): boolean | null {
    return typeof value === "boolean" ? value : null;
  }

  private readRecord(value: unknown): Record<string, unknown> | null {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return null;
    }

    return value as Record<string, unknown>;
  }
}
