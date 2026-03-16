import {
  REPLAY_SCHEMA_VERSION,
  type ReplayCardChoiceV1,
  type ReplayCommandBatchV1,
  type ReplayCommandV1,
  type ReplayConfigFingerprintV1,
  type ReplayFormatV1,
  type ReplayStartOptionsV1,
  type ReplayValidationResult
} from "./replay-format.v1";

export type ReplayExportInput = Readonly<{
  battleSeed: number;
  appVersion?: string;
  difficultyPresetId?: string | null;
  startOptions?: ReplayStartOptionsV1;
  commands: ReadonlyArray<ReplayCommandBatchV1>;
  configFingerprint: ReplayConfigFingerprintV1;
  notes?: string;
  cardChoices?: ReadonlyArray<ReplayCardChoiceV1>;
}>;

export class ReplayIoService {
  buildReplay(input: ReplayExportInput): ReplayFormatV1 {
    return {
      schemaVersion: REPLAY_SCHEMA_VERSION,
      createdAtIso: new Date().toISOString(),
      appVersion: this.readString(input.appVersion) ?? undefined,
      battleSeed: Math.floor(input.battleSeed),
      difficultyPresetId: this.readString(input.difficultyPresetId) ?? null,
      startOptions: input.startOptions
        ? {
            ...(typeof input.startOptions.seedOverride === "number"
              ? { seedOverride: Math.floor(input.startOptions.seedOverride) }
              : {}),
            ...(this.readString(input.startOptions.presetId)
              ? { presetId: this.readString(input.startOptions.presetId)! }
              : {})
          }
        : undefined,
      commands: input.commands.map((batch) => ({
        tick: Math.max(0, Math.floor(batch.tick)),
        ...(batch.stepCount && batch.stepCount > 1 ? { stepCount: Math.max(1, Math.floor(batch.stepCount)) } : {}),
        commands: batch.commands.map((command) => this.cloneCommand(command))
      })),
      configFingerprint: {
        stepDeltaMs: Math.max(1, Math.floor(input.configFingerprint.stepDeltaMs)),
        gridW: Math.max(1, Math.floor(input.configFingerprint.gridW)),
        gridH: Math.max(1, Math.floor(input.configFingerprint.gridH))
      },
      notes: this.readString(input.notes) ?? undefined,
      cardChoices: input.cardChoices?.map((choice) => ({
        tick: Math.max(0, Math.floor(choice.tick)),
        choiceId: choice.choiceId,
        selectedCardId: choice.selectedCardId
      }))
    };
  }

  serializePrettyJson(replay: ReplayFormatV1): string {
    return JSON.stringify(replay, null, 2);
  }

  tryParseAndValidate(rawJson: string): ReplayValidationResult {
    if (rawJson.trim().length === 0) {
      return { ok: false, error: "Replay JSON is empty." };
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(rawJson);
    } catch (error) {
      return { ok: false, error: `Replay JSON parse failed: ${this.stringifyError(error)}` };
    }

    const root = this.readRecord(parsed);
    if (!root) {
      return { ok: false, error: "Replay payload must be a JSON object." };
    }

    const schemaVersion = this.readNumber(root["schemaVersion"]);
    if (schemaVersion !== REPLAY_SCHEMA_VERSION) {
      return {
        ok: false,
        error: `Unsupported schemaVersion '${String(root["schemaVersion"])}'. Expected ${REPLAY_SCHEMA_VERSION}.`
      };
    }

    const battleSeed = this.readNumber(root["battleSeed"]);
    if (battleSeed === null) {
      return { ok: false, error: "Replay is missing required field 'battleSeed'." };
    }

    const createdAtIso = this.readString(root["createdAtIso"]);
    if (!createdAtIso) {
      return { ok: false, error: "Replay is missing required field 'createdAtIso'." };
    }

    const commandsValue = root["commands"];
    if (!Array.isArray(commandsValue) || commandsValue.length === 0) {
      return { ok: false, error: "Replay commands must be a non-empty array." };
    }

    const normalizedCommands: ReplayCommandBatchV1[] = [];
    let previousTick = -1;
    for (let index = 0; index < commandsValue.length; index += 1) {
      const batchRecord = this.readRecord(commandsValue[index]);
      if (!batchRecord) {
        return { ok: false, error: `commands[${index}] must be an object.` };
      }

      const tick = this.readNumber(batchRecord["tick"]);
      if (tick === null || tick < 0) {
        return { ok: false, error: `commands[${index}].tick must be a non-negative integer.` };
      }

      const safeTick = Math.floor(tick);
      if (safeTick < previousTick) {
        return { ok: false, error: `commands ticks must be non-decreasing (index ${index}).` };
      }

      previousTick = safeTick;
      const batchCommandsValue = batchRecord["commands"];
      if (!Array.isArray(batchCommandsValue)) {
        return { ok: false, error: `commands[${index}].commands must be an array.` };
      }

      const normalizedBatchCommands: ReplayCommandV1[] = [];
      for (let commandIndex = 0; commandIndex < batchCommandsValue.length; commandIndex += 1) {
        const commandRecord = this.readRecord(batchCommandsValue[commandIndex]);
        if (!commandRecord) {
          return { ok: false, error: `commands[${index}].commands[${commandIndex}] must be an object.` };
        }

        const commandType = this.readString(commandRecord["type"]);
        if (!commandType) {
          return { ok: false, error: `commands[${index}].commands[${commandIndex}] is missing 'type'.` };
        }

        normalizedBatchCommands.push(this.cloneCommand(commandRecord as ReplayCommandV1));
      }

      const rawStepCount = this.readNumber(batchRecord["stepCount"]);
      const safeStepCount = rawStepCount !== null && rawStepCount > 1 ? Math.floor(rawStepCount) : undefined;

      normalizedCommands.push({
        tick: safeTick,
        ...(safeStepCount ? { stepCount: safeStepCount } : {}),
        commands: normalizedBatchCommands
      });
    }

    const configRecord = this.readRecord(root["configFingerprint"]);
    if (!configRecord) {
      return { ok: false, error: "Replay is missing required object 'configFingerprint'." };
    }

    const stepDeltaMs = this.readNumber(configRecord["stepDeltaMs"]);
    const gridW = this.readNumber(configRecord["gridW"]);
    const gridH = this.readNumber(configRecord["gridH"]);
    if (stepDeltaMs === null || stepDeltaMs <= 0 || gridW === null || gridW <= 0 || gridH === null || gridH <= 0) {
      return { ok: false, error: "configFingerprint requires positive stepDeltaMs, gridW and gridH." };
    }

    const startOptionsRecord = this.readRecord(root["startOptions"]);
    const cardChoicesValue = root["cardChoices"];
    const normalizedCardChoices: ReplayCardChoiceV1[] = [];
    if (Array.isArray(cardChoicesValue)) {
      for (let index = 0; index < cardChoicesValue.length; index += 1) {
        const choiceRecord = this.readRecord(cardChoicesValue[index]);
        if (!choiceRecord) {
          return { ok: false, error: `cardChoices[${index}] must be an object.` };
        }

        const tick = this.readNumber(choiceRecord["tick"]);
        const choiceId = this.readString(choiceRecord["choiceId"]);
        const selectedCardId = this.readString(choiceRecord["selectedCardId"]);
        if (tick === null || tick < 0 || !choiceId || !selectedCardId) {
          return { ok: false, error: `cardChoices[${index}] requires tick, choiceId and selectedCardId.` };
        }

        normalizedCardChoices.push({
          tick: Math.floor(tick),
          choiceId,
          selectedCardId
        });
      }
    }

    const replay: ReplayFormatV1 = {
      schemaVersion: REPLAY_SCHEMA_VERSION,
      createdAtIso,
      appVersion: this.readString(root["appVersion"]) ?? undefined,
      battleSeed: Math.floor(battleSeed),
      difficultyPresetId: this.readString(root["difficultyPresetId"]) ?? null,
      startOptions: startOptionsRecord
        ? {
            ...(typeof startOptionsRecord["seedOverride"] === "number"
              ? { seedOverride: Math.floor(startOptionsRecord["seedOverride"] as number) }
              : {}),
            ...(this.readString(startOptionsRecord["presetId"])
              ? { presetId: this.readString(startOptionsRecord["presetId"])! }
              : {})
          }
        : undefined,
      commands: normalizedCommands,
      configFingerprint: {
        stepDeltaMs: Math.floor(stepDeltaMs),
        gridW: Math.floor(gridW),
        gridH: Math.floor(gridH)
      },
      notes: this.readString(root["notes"]) ?? undefined,
      cardChoices: normalizedCardChoices
    };

    return { ok: true, replay };
  }

  async readFileText(file: File): Promise<string> {
    return file.text();
  }

  private cloneCommand(command: ReplayCommandV1): ReplayCommandV1 {
    return {
      ...command,
      assistConfig: command.assistConfig
        ? {
            ...command.assistConfig,
            autoSkills: command.assistConfig.autoSkills
              ? { ...command.assistConfig.autoSkills }
              : command.assistConfig.autoSkills
          }
        : command.assistConfig
    };
  }

  private stringifyError(error: unknown): string {
    if (error instanceof Error) {
      return `${error.name}: ${error.message}`;
    }

    try {
      return JSON.stringify(error);
    } catch {
      return String(error);
    }
  }

  private readString(value: unknown): string | null {
    return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
  }

  private readNumber(value: unknown): number | null {
    return typeof value === "number" && Number.isFinite(value) ? value : null;
  }

  private readRecord(value: unknown): Record<string, unknown> | null {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return null;
    }

    return value as Record<string, unknown>;
  }
}
