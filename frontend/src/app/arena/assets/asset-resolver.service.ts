import { Injectable } from "@angular/core";
import {
  AssetFrameRect,
  AssetManifestEntry,
  AnimAssetFrameSource,
  AssetPackManifest,
  NormalizedAssetManifestEntry,
  ResolvedAsset,
  SemanticAssetId
} from "./asset-manifest.types";

@Injectable({ providedIn: "root" })
export class AssetResolverService {
  private readonly manifestUrl = "/assets/packs/arena_v1_0x72_bdragon/asset-pack.json";
  private loadPromise?: Promise<void>;
  private manifest?: AssetPackManifest;
  private resolvedBasePath = "/assets/packs/arena_v1_0x72_bdragon";

  loadManifest(): Promise<void> {
    if (this.manifest) {
      return Promise.resolve();
    }

    if (this.loadPromise) {
      return this.loadPromise;
    }

    this.loadPromise = fetch(this.manifestUrl)
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`Failed to load asset manifest (${response.status}).`);
        }

        const manifest = (await response.json()) as AssetPackManifest;
        this.manifest = manifest;
        this.resolvedBasePath = manifest.basePath?.replace(/\/+$/, "") ?? this.resolvedBasePath;
      })
      .finally(() => {
        this.loadPromise = undefined;
      });

    return this.loadPromise;
  }

  resolve(assetId: SemanticAssetId): ResolvedAsset {
    return this.resolveInternal(assetId, new Set<string>());
  }

  private resolveInternal(assetId: SemanticAssetId, resolutionStack: Set<string>): ResolvedAsset {
    if (resolutionStack.has(assetId)) {
      throw new Error(`Circular asset reference detected while resolving '${assetId}'.`);
    }

    resolutionStack.add(assetId);
    try {
      const manifest = this.requireManifest();
      const entry = manifest.assets[assetId];

      if (!entry) {
        throw new Error(`Asset semantic ID not found: '${assetId}'.`);
      }

      if ("type" in entry && entry.type === "alias") {
        const referencedAsset = this.resolveInternal(entry.assetId, resolutionStack);
        return {
          ...referencedAsset,
          id: assetId
        };
      }

      const normalized = this.normalizeEntry(entry);
      if (normalized.type === "anim") {
        const frameUrls = (normalized.frameSources ?? []).map((source) =>
          this.resolveAnimFrameSource(source, resolutionStack)
        );
        if (frameUrls.length === 0) {
          throw new Error(`Animation asset '${assetId}' must define at least one frame.`);
        }

        return {
          id: assetId,
          type: "anim",
          url: frameUrls[0],
          frameUrls,
          fps: normalized.fps
        };
      }

      if (normalized.type === "anim_strip") {
        const rawFrameWidth = Math.floor(normalized.frameWidth ?? 0);
        const rawFrameHeight = Math.floor(normalized.frameHeight ?? 0);
        if (rawFrameWidth <= 0 || rawFrameHeight <= 0) {
          throw new Error(`Animation strip '${assetId}' has invalid frame dimensions.`);
        }
        const frameWidth = Math.max(1, rawFrameWidth);
        const frameHeight = Math.max(1, rawFrameHeight);

        return {
          id: assetId,
          type: "anim_strip",
          url: this.toAssetUrl(normalized.path),
          frameWidth,
          frameHeight,
          fps: normalized.fps ?? 12,
          frameCount: Math.max(0, Math.floor(normalized.frameCount ?? 0))
        };
      }

      if (normalized.type === "anim_strip_rows") {
        const rawFrameWidth = Math.floor(normalized.frameWidth ?? 0);
        const rawFrameHeight = Math.floor(normalized.frameHeight ?? 0);
        const rawRowCount = Math.floor(normalized.rowCount ?? 0);
        if (rawFrameWidth <= 0 || rawFrameHeight <= 0) {
          throw new Error(`Animation strip rows '${assetId}' has invalid frame dimensions.`);
        }

        if (rawRowCount <= 0) {
          throw new Error(`Animation strip rows '${assetId}' must define rowCount >= 1.`);
        }

        return {
          id: assetId,
          type: "anim_strip_rows",
          url: this.toAssetUrl(normalized.path),
          frameWidth: Math.max(1, rawFrameWidth),
          frameHeight: Math.max(1, rawFrameHeight),
          rowCount: rawRowCount,
          fps: normalized.fps ?? 12,
          frameCount: Math.max(0, Math.floor(normalized.frameCount ?? 0))
        };
      }

      return {
        id: assetId,
        type: normalized.type,
        url: this.toAssetUrl(normalized.path),
        frame: normalized.frame,
        fps: normalized.fps,
        width: normalized.w,
        height: normalized.h
      };
    } finally {
      resolutionStack.delete(assetId);
    }
  }

  getUiFrame(frameId: string): ResolvedAsset {
    return this.resolveAlias(frameId, this.requireManifest().maps?.uiFrames);
  }

  getFx(fxId: string): ResolvedAsset {
    return this.resolveAlias(fxId, this.requireManifest().maps?.fx);
  }

  getTile(tileId: string): ResolvedAsset {
    return this.resolveAlias(tileId, this.requireManifest().maps?.tiles);
  }

  getSprite(spriteId: string): ResolvedAsset {
    return this.resolveAlias(spriteId, this.requireManifest().maps?.sprites);
  }

  private resolveAlias(aliasOrSemanticId: string, map?: Record<string, SemanticAssetId>): ResolvedAsset {
    const semanticId = map?.[aliasOrSemanticId] ?? aliasOrSemanticId;
    return this.resolve(semanticId);
  }

  private requireManifest(): AssetPackManifest {
    if (!this.manifest) {
      throw new Error("Asset manifest not loaded. Call loadManifest() first.");
    }

    return this.manifest;
  }

  private normalizeEntry(entry: AssetManifestEntry): NormalizedAssetManifestEntry {
    if ("type" in entry) {
      if (entry.type === "image") {
        return {
          type: "image",
          path: entry.path,
          w: entry.w,
          h: entry.h
        };
      }

      if (entry.type === "sheet") {
        return {
          type: "sheet",
          path: entry.path,
          frame: this.toFrameRect(entry.frame)
        };
      }

      if (entry.type === "anim_strip") {
        const resolvedPath = entry.src?.trim() || entry.path?.trim() || "";
        if (resolvedPath.length === 0) {
          throw new Error("Animation strip entry requires either 'src' or 'path'.");
        }

        return {
          type: "anim_strip",
          path: resolvedPath,
          frameWidth: entry.frameWidth,
          frameHeight: entry.frameHeight,
          fps: entry.fps ?? 12,
          frameCount: entry.frameCount ?? 0
        };
      }

      if (entry.type === "anim_strip_rows") {
        const resolvedPath = entry.src?.trim() || entry.path?.trim() || "";
        if (resolvedPath.length === 0) {
          throw new Error("Animation strip rows entry requires either 'src' or 'path'.");
        }

        return {
          type: "anim_strip_rows",
          path: resolvedPath,
          frameWidth: entry.frameWidth,
          frameHeight: entry.frameHeight,
          rowCount: entry.rowCount,
          fps: entry.fps ?? 12,
          frameCount: entry.frameCount ?? 0
        };
      }

      if (entry.type === "anim") {
        return {
          type: "anim",
          path: "",
          frameSources: entry.frames,
          fps: entry.fps ?? 12
        };
      }

      throw new Error(`Unsupported asset entry type '${String((entry as { type?: string }).type)}'.`);
    }

    return {
      type: "image",
      path: entry.path
    };
  }

  private resolveAnimFrameSource(source: AnimAssetFrameSource, resolutionStack: Set<string>): string {
    if (typeof source === "string") {
      return this.toAssetUrl(source);
    }

    const referenced = this.resolveInternal(source.assetId, resolutionStack);
    if (referenced.type === "anim" && referenced.frameUrls && referenced.frameUrls.length > 0) {
      return referenced.frameUrls[0];
    }

    return referenced.url;
  }

  private toFrameRect(frame: readonly [number, number, number, number]): AssetFrameRect {
    return {
      x: frame[0],
      y: frame[1],
      w: frame[2],
      h: frame[3]
    };
  }

  private toAssetUrl(path: string): string {
    if (path.startsWith("/")) {
      return path;
    }

    const relativePath = path.replace(/^\/+/, "");
    return `${this.resolvedBasePath}/${relativePath}`;
  }
}
