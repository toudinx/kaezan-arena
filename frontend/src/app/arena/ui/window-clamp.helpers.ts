export type WindowClampInput = Readonly<{
  x: number;
  y: number;
  width: number;
  height: number;
  viewportWidth: number;
  viewportHeight: number;
}>;

export type WindowPosition = Readonly<{
  x: number;
  y: number;
}>;

export function clampWindowPosition(input: WindowClampInput): WindowPosition {
  const viewportWidth = Math.max(1, Math.floor(input.viewportWidth));
  const viewportHeight = Math.max(1, Math.floor(input.viewportHeight));
  const width = Math.max(1, Math.floor(input.width));
  const height = Math.max(1, Math.floor(input.height));

  const maxX = Math.max(0, viewportWidth - width);
  const maxY = Math.max(0, viewportHeight - height);
  const x = Math.min(maxX, Math.max(0, Math.round(input.x)));
  const y = Math.min(maxY, Math.max(0, Math.round(input.y)));

  return { x, y };
}
