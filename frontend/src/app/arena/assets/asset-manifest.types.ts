export type SemanticAssetId = string;

export type AssetType = "image" | "sheet" | "anim" | "anim_strip" | "anim_strip_rows";
export type LegacyAssetKind = "image" | "spritesheet";

export interface AssetFrameRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface ImageAssetManifestEntry {
  type: "image";
  path: string;
  w?: number;
  h?: number;
}

export interface SheetAssetManifestEntry {
  type: "sheet";
  path: string;
  frame: [number, number, number, number];
}

export interface AnimAssetFrameBySemanticId {
  assetId: SemanticAssetId;
}

export type AnimAssetFrameSource = string | AnimAssetFrameBySemanticId;

export interface AnimAssetManifestEntry {
  type: "anim";
  frames: AnimAssetFrameSource[];
  fps?: number;
}

export interface AnimStripAssetManifestEntry {
  type: "anim_strip";
  src?: string;
  path?: string;
  frameWidth: number;
  frameHeight: number;
  fps?: number;
  frameCount?: number;
}

export interface AnimStripRowsAssetManifestEntry {
  type: "anim_strip_rows";
  src?: string;
  path?: string;
  frameWidth: number;
  frameHeight: number;
  fps?: number;
  rowCount: number;
  frameCount?: number;
}

export interface AliasAssetManifestEntry {
  type: "alias";
  assetId: SemanticAssetId;
}

export interface LegacyAssetManifestEntry {
  path: string;
  kind?: LegacyAssetKind;
}

export type AssetManifestEntry =
  | ImageAssetManifestEntry
  | SheetAssetManifestEntry
  | AnimAssetManifestEntry
  | AnimStripAssetManifestEntry
  | AnimStripRowsAssetManifestEntry
  | AliasAssetManifestEntry
  | LegacyAssetManifestEntry;

export interface NormalizedAssetManifestEntry {
  type: AssetType;
  path: string;
  frame?: AssetFrameRect;
  frameSources?: AnimAssetFrameSource[];
  frameWidth?: number;
  frameHeight?: number;
  frameCount?: number;
  rowCount?: number;
  fps?: number;
  w?: number;
  h?: number;
}

export interface AssetAliasMaps {
  uiFrames?: Record<string, SemanticAssetId>;
  fx?: Record<string, SemanticAssetId>;
  tiles?: Record<string, SemanticAssetId>;
  sprites?: Record<string, SemanticAssetId>;
}

export interface AssetPackManifest {
  packId: string;
  version: string;
  basePath?: string;
  assets: Record<SemanticAssetId, AssetManifestEntry>;
  maps?: AssetAliasMaps;
}

export interface ResolvedAsset {
  id: SemanticAssetId;
  type: AssetType;
  url: string;
  frame?: AssetFrameRect;
  frameUrls?: string[];
  frameWidth?: number;
  frameHeight?: number;
  frameCount?: number;
  rowCount?: number;
  fps?: number;
  width?: number;
  height?: number;
}

export interface PreloadedAsset {
  image: HTMLImageElement;
  frames?: HTMLImageElement[];
  resolved: ResolvedAsset;
}
