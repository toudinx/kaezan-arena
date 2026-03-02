import { Injectable } from "@angular/core";
import { AssetResolverService } from "./asset-resolver.service";
import { PreloadedAsset } from "./asset-manifest.types";

@Injectable({ providedIn: "root" })
export class AssetPreloaderService {
  private readonly imageCache = new Map<string, Promise<HTMLImageElement>>();

  constructor(private readonly resolver: AssetResolverService) {}

  async preloadAsset(assetId: string): Promise<HTMLImageElement> {
    const loaded = await this.preloadResolvedAsset(assetId);
    return loaded.image;
  }

  async preloadResolvedAsset(assetId: string): Promise<PreloadedAsset> {
    await this.resolver.loadManifest();
    const resolved = this.resolver.resolve(assetId);
    if (resolved.type === "anim") {
      const frameUrls = resolved.frameUrls ?? [resolved.url];
      const frames = await Promise.all(
        frameUrls.map((url, index) => this.loadImage(`${resolved.id}#${index}:${url}`, url))
      );
      return { image: frames[0], frames, resolved };
    }

    if (resolved.type === "anim_strip") {
      const image = await this.loadImage(resolved.url, resolved.url);
      const frameWidth = Math.max(1, Math.floor(resolved.frameWidth ?? image.width));
      const frameHeight = Math.max(1, Math.floor(resolved.frameHeight ?? image.height));
      const declaredFrameCount = Math.max(0, Math.floor(resolved.frameCount ?? 0));
      const computedFrameCount = Math.floor(image.width / frameWidth);
      const frameCount = Math.max(1, declaredFrameCount > 0 ? declaredFrameCount : computedFrameCount);

      return {
        image,
        frames: [image],
        resolved: {
          ...resolved,
          frameWidth,
          frameHeight,
          frameCount,
          fps: resolved.fps ?? 12
        }
      };
    }

    if (resolved.type === "anim_strip_rows") {
      const image = await this.loadImage(resolved.url, resolved.url);
      const frameWidth = Math.max(1, Math.floor(resolved.frameWidth ?? image.width));
      const frameHeight = Math.max(1, Math.floor(resolved.frameHeight ?? image.height));
      const declaredFrameCount = Math.max(0, Math.floor(resolved.frameCount ?? 0));
      const computedFrameCount = Math.floor(image.width / frameWidth);
      const frameCount = Math.max(1, declaredFrameCount > 0 ? declaredFrameCount : computedFrameCount);
      const declaredRowCount = Math.max(1, Math.floor(resolved.rowCount ?? 1));
      const computedRowCount = Math.max(1, Math.floor(image.height / frameHeight));
      const rowCount = Math.max(1, Math.min(declaredRowCount, computedRowCount));

      return {
        image,
        frames: [image],
        resolved: {
          ...resolved,
          frameWidth,
          frameHeight,
          frameCount,
          rowCount,
          fps: resolved.fps ?? 12
        }
      };
    }

    const image = await this.loadImage(resolved.url, resolved.url);
    return { image, resolved, frames: [image] };
  }

  async preloadUiFrame(frameId: string): Promise<HTMLImageElement> {
    await this.resolver.loadManifest();
    const resolved = this.resolver.getUiFrame(frameId);
    return this.loadImage(resolved.url, resolved.url);
  }

  async preloadFx(fxId: string): Promise<HTMLImageElement> {
    await this.resolver.loadManifest();
    const resolved = this.resolver.getFx(fxId);
    return this.loadImage(resolved.url, resolved.url);
  }

  private loadImage(cacheKey: string, url: string): Promise<HTMLImageElement> {
    const cached = this.imageCache.get(cacheKey);
    if (cached) {
      return cached;
    }

    const promise = new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error(`Image failed to load: '${url}'.`));
      image.src = url;
    });

    this.imageCache.set(cacheKey, promise);
    return promise;
  }
}
