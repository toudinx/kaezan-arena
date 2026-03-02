import { ArenaScene, FxInstance, FxPlanSpawn, FxSpawnRequest, TilePos } from "./arena-engine.types";
const PHYSICAL_ELEMENT = 6;

export function spawnFx(scene: ArenaScene, request: FxSpawnRequest): ArenaScene {
  const nextFx: FxInstance = {
    fxId: request.fxId,
    tilePos: request.tilePos,
    durationMs: Math.max(1, request.durationMs),
    elapsedMs: 0,
    layer: request.layer,
    element: request.element ?? PHYSICAL_ELEMENT,
    startFrame: request.startFrame ?? 0
  };

  return {
    ...scene,
    fxInstances: [...scene.fxInstances, nextFx]
  };
}

export function spawnAreaFx(
  scene: ArenaScene,
  centerTile: TilePos,
  radius: number,
  fxId: string,
  durationMs: number,
  layer: "groundFx" | "hitFx" = "groundFx"
): ArenaScene {
  const plan = planSquareAreaFx(scene, centerTile, radius, fxId);
  return spawnFxPlan(scene, plan, durationMs, layer);
}

export function planSquareAreaFx(
  scene: ArenaScene,
  centerTile: TilePos,
  radius: number,
  fxId: string
): FxPlanSpawn[] {
  const clampedRadius = Math.max(0, radius);
  const plan: FxPlanSpawn[] = [];

  for (let y = centerTile.y - clampedRadius; y <= centerTile.y + clampedRadius; y += 1) {
    for (let x = centerTile.x - clampedRadius; x <= centerTile.x + clampedRadius; x += 1) {
      if (!isInsideArena(scene, x, y)) {
        continue;
      }

      plan.push({
        fxId,
        tilePos: { x, y },
        startFrame: computeStartFrameOffset(x, y)
      });
    }
  }

  return plan;
}

export function spawnFxPlan(
  scene: ArenaScene,
  plan: ReadonlyArray<FxPlanSpawn>,
  durationMs: number,
  layer: "groundFx" | "hitFx" = "groundFx"
): ArenaScene {
  const safeDurationMs = Math.max(1, durationMs);
  const newInstances: FxInstance[] = [];

  for (const spawn of plan) {
    const x = spawn.tilePos.x;
    const y = spawn.tilePos.y;
    if (!isInsideArena(scene, x, y)) {
      continue;
    }

    newInstances.push({
      fxId: spawn.fxId,
      tilePos: { x, y },
      durationMs: safeDurationMs,
      elapsedMs: 0,
      layer,
      element: spawn.element ?? PHYSICAL_ELEMENT,
      startFrame: spawn.startFrame ?? computeStartFrameOffset(x, y)
    });
  }

  if (newInstances.length === 0) {
    return scene;
  }

  return {
    ...scene,
    fxInstances: [...scene.fxInstances, ...newInstances]
  };
}

export function tickFx(scene: ArenaScene, deltaMs: number): ArenaScene {
  if (scene.fxInstances.length === 0) {
    return scene;
  }

  const safeDelta = Math.max(0, deltaMs);
  const active = scene.fxInstances
    .map((fx) => ({ ...fx, elapsedMs: fx.elapsedMs + safeDelta }))
    .filter((fx) => fx.elapsedMs < fx.durationMs);

  if (active.length === scene.fxInstances.length) {
    return {
      ...scene,
      fxInstances: active
    };
  }

  return {
    ...scene,
    fxInstances: active
  };
}

function isInsideArena(scene: ArenaScene, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < scene.columns && y < scene.rows;
}

function computeStartFrameOffset(x: number, y: number): number {
  // Deterministic tile-based offset prevents all AoE tiles from animating in lockstep.
  const hash = Math.abs((x * 73856093) ^ (y * 19349663));
  return hash % 6;
}
