import { TilePos } from "../../arena/engine/arena-engine.types";

export interface CanvasRectLike {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface GridLayout {
  columns: number;
  rows: number;
  tileSize: number;
  canvasWidth: number;
  canvasHeight: number;
}

export interface PointerActorState {
  actorId: string;
  kind: string;
  tileX: number;
  tileY: number;
}

export type PointerActionKind = "left_click" | "right_click";

export interface PointerBattleCommand {
  type: "set_target" | "set_ground_target";
  targetEntityId?: string | null;
  groundTileX?: number | null;
  groundTileY?: number | null;
}

export function screenToTile(screenX: number, screenY: number, rect: CanvasRectLike, layout: GridLayout): TilePos | null {
  if (rect.width <= 0 || rect.height <= 0 || layout.tileSize <= 0 || layout.columns <= 0 || layout.rows <= 0) {
    return null;
  }

  const localX = screenX - rect.left;
  const localY = screenY - rect.top;
  if (localX < 0 || localY < 0 || localX >= rect.width || localY >= rect.height) {
    return null;
  }

  const origin = computeBoardOrigin(layout);
  const boardWidth = layout.columns * layout.tileSize;
  const boardHeight = layout.rows * layout.tileSize;
  if (localX < origin.x || localY < origin.y || localX >= origin.x + boardWidth || localY >= origin.y + boardHeight) {
    return null;
  }

  const tileX = Math.floor((localX - origin.x) / layout.tileSize);
  const tileY = Math.floor((localY - origin.y) / layout.tileSize);
  if (tileX < 0 || tileY < 0 || tileX >= layout.columns || tileY >= layout.rows) {
    return null;
  }

  return { x: tileX, y: tileY };
}

export function hitTestMobAtTile(actors: ReadonlyArray<PointerActorState>, tile: TilePos): string | null {
  let match: string | null = null;
  for (const actor of actors) {
    if (actor.kind !== "mob" || actor.tileX !== tile.x || actor.tileY !== tile.y) {
      continue;
    }

    if (match === null || actor.actorId.localeCompare(match) < 0) {
      match = actor.actorId;
    }
  }

  return match;
}

export function resolvePointerCommand(
  action: PointerActionKind,
  tile: TilePos | null,
  actors: ReadonlyArray<PointerActorState>
): PointerBattleCommand | null {
  if (!tile) {
    return null;
  }

  if (action === "left_click") {
    return {
      type: "set_ground_target",
      groundTileX: tile.x,
      groundTileY: tile.y
    };
  }

  return {
    type: "set_target",
    targetEntityId: hitTestMobAtTile(actors, tile)
  };
}

function computeBoardOrigin(layout: GridLayout): { x: number; y: number } {
  const boardWidth = layout.columns * layout.tileSize;
  const boardHeight = layout.rows * layout.tileSize;
  return {
    x: Math.max(0, (layout.canvasWidth - boardWidth) / 2),
    y: Math.max(0, (layout.canvasHeight - boardHeight) / 2)
  };
}
