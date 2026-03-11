import type { StepBattleRequest } from "../../api/battle-api.service";

export const REPLAY_SCHEMA_VERSION = 1 as const;

export type ReplayCommandV1 = NonNullable<StepBattleRequest["commands"]>[number];

export type ReplayCommandBatchV1 = Readonly<{
  tick: number;
  commands: ReplayCommandV1[];
}>;

export type ReplayCardChoiceV1 = Readonly<{
  tick: number;
  choiceId: string;
  selectedCardId: string;
}>;

export type ReplayConfigFingerprintV1 = Readonly<{
  stepDeltaMs: number;
  gridW: number;
  gridH: number;
}>;

export type ReplayStartOptionsV1 = Readonly<{
  seedOverride?: number;
  presetId?: string;
}>;

export type ReplayFormatV1 = Readonly<{
  schemaVersion: typeof REPLAY_SCHEMA_VERSION;
  createdAtIso: string;
  appVersion?: string;
  battleSeed: number;
  difficultyPresetId?: string | null;
  startOptions?: ReplayStartOptionsV1;
  commands: ReplayCommandBatchV1[];
  configFingerprint: ReplayConfigFingerprintV1;
  notes?: string;
  cardChoices?: ReplayCardChoiceV1[];
}>;

export type ReplayValidationResult =
  | Readonly<{ ok: true; replay: ReplayFormatV1 }>
  | Readonly<{ ok: false; error: string }>;
