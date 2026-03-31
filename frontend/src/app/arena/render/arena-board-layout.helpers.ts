export interface ArenaBoardLayoutInput {
  columns: number;
  rows: number;
  tileSize: number;
  canvasWidth: number;
  canvasHeight: number;
}

export interface ArenaBoardOrigin {
  x: number;
  y: number;
}

export interface ArenaBoardSafePaddingPx {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

type ArenaBoardSafePaddingUnits = Readonly<{
  left: number;
  right: number;
  top: number;
  bottom: number;
}>;

// Safe margins reserve room for hp bars/markers/floating combat text near board edges.
const ARENA_BOARD_SAFE_PADDING_UNITS: ArenaBoardSafePaddingUnits = {
  left: 0.22,
  right: 0.22,
  top: 0.5,
  bottom: 0.38
};

export function computeArenaBoardSafePaddingPx(tileSize: number): ArenaBoardSafePaddingPx {
  const safeTileSize = Math.max(1, tileSize);
  return {
    left: ARENA_BOARD_SAFE_PADDING_UNITS.left * safeTileSize,
    right: ARENA_BOARD_SAFE_PADDING_UNITS.right * safeTileSize,
    top: ARENA_BOARD_SAFE_PADDING_UNITS.top * safeTileSize,
    bottom: ARENA_BOARD_SAFE_PADDING_UNITS.bottom * safeTileSize
  };
}

export function computeArenaBoardOrigin(layout: ArenaBoardLayoutInput): ArenaBoardOrigin {
  const boardWidth = layout.columns * layout.tileSize;
  const boardHeight = layout.rows * layout.tileSize;
  const centeredX = (layout.canvasWidth - boardWidth) / 2;
  const centeredY = (layout.canvasHeight - boardHeight) / 2;
  const safePadding = computeArenaBoardSafePaddingPx(layout.tileSize);
  const minX = safePadding.left;
  const minY = safePadding.top;
  const maxX = layout.canvasWidth - safePadding.right - boardWidth;
  const maxY = layout.canvasHeight - safePadding.bottom - boardHeight;

  return {
    x: maxX >= minX ? clamp(centeredX, minX, maxX) : Math.max(0, centeredX),
    y: maxY >= minY ? clamp(centeredY, minY, maxY) : Math.max(0, centeredY)
  };
}

export function computeMaxTileSizeForViewport(
  columns: number,
  rows: number,
  canvasWidth: number,
  canvasHeight: number
): number {
  if (columns <= 0 || rows <= 0 || canvasWidth <= 0 || canvasHeight <= 0) {
    return 0;
  }

  const widthUnits = columns + ARENA_BOARD_SAFE_PADDING_UNITS.left + ARENA_BOARD_SAFE_PADDING_UNITS.right;
  const heightUnits = rows + ARENA_BOARD_SAFE_PADDING_UNITS.top + ARENA_BOARD_SAFE_PADDING_UNITS.bottom;
  if (widthUnits <= 0 || heightUnits <= 0) {
    return 0;
  }

  const tileSizeByWidth = canvasWidth / widthUnits;
  const tileSizeByHeight = canvasHeight / heightUnits;
  const raw = Math.min(tileSizeByWidth, tileSizeByHeight);
  if (!Number.isFinite(raw) || raw <= 0) {
    return 0;
  }

  return Math.floor(raw);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
