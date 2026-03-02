import { AssetPackManifest, ResolvedAsset } from "./asset-manifest.types";
import { AssetPreloaderService } from "./asset-preloader.service";
import { AssetResolverService } from "./asset-resolver.service";

describe("Asset animation strip support", () => {
  describe("AssetResolverService", () => {
    it("normalizes anim_strip entries", () => {
      const resolver = new AssetResolverService();
      const manifest: AssetPackManifest = {
        packId: "test-pack",
        version: "1.0.0",
        basePath: "/assets/test-pack",
        assets: {
          "fx.auto_attack.hit": {
            type: "anim_strip",
            src: "fx/hit_strip.png",
            frameWidth: 32,
            frameHeight: 32,
            fps: 12,
            frameCount: 0
          }
        }
      };

      const mutableResolver = resolver as unknown as {
        manifest?: AssetPackManifest;
        resolvedBasePath: string;
      };
      mutableResolver.manifest = manifest;
      mutableResolver.resolvedBasePath = "/assets/test-pack";

      const resolved = resolver.resolve("fx.auto_attack.hit");
      expect(resolved.type).toBe("anim_strip");
      expect(resolved.url).toBe("/assets/test-pack/fx/hit_strip.png");
      expect(resolved.frameWidth).toBe(32);
      expect(resolved.frameHeight).toBe(32);
      expect(resolved.fps).toBe(12);
      expect(resolved.frameCount).toBe(0);
    });

    it("normalizes anim_strip_rows entries", () => {
      const resolver = new AssetResolverService();
      const manifest: AssetPackManifest = {
        packId: "test-pack",
        version: "1.0.0",
        basePath: "/assets/test-pack",
        assets: {
          "fx.hit.base": {
            type: "anim_strip_rows",
            src: "fx/rpg_effect/03.png",
            frameWidth: 64,
            frameHeight: 64,
            fps: 12,
            rowCount: 9,
            frameCount: 0
          }
        }
      };

      const mutableResolver = resolver as unknown as {
        manifest?: AssetPackManifest;
        resolvedBasePath: string;
      };
      mutableResolver.manifest = manifest;
      mutableResolver.resolvedBasePath = "/assets/test-pack";

      const resolved = resolver.resolve("fx.hit.base");
      expect(resolved.type).toBe("anim_strip_rows");
      expect(resolved.url).toBe("/assets/test-pack/fx/rpg_effect/03.png");
      expect(resolved.frameWidth).toBe(64);
      expect(resolved.frameHeight).toBe(64);
      expect(resolved.rowCount).toBe(9);
      expect(resolved.frameCount).toBe(0);
    });
  });

  describe("AssetPreloaderService", () => {
    const originalImage = globalThis.Image;

    class MockImage {
      width = 96;
      height = 288;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;

      set src(_value: string) {
        setTimeout(() => {
          this.onload?.();
        }, 0);
      }
    }

    beforeEach(() => {
      (globalThis as unknown as { Image: typeof Image }).Image = MockImage as unknown as typeof Image;
    });

    afterEach(() => {
      (globalThis as unknown as { Image: typeof Image }).Image = originalImage;
    });

    it("computes frameCount from strip width when frameCount is zero", async () => {
      const resolvedStrip: ResolvedAsset = {
        id: "fx.auto_attack.hit",
        type: "anim_strip",
        url: "/assets/test-pack/fx/hit_strip.png",
        frameWidth: 32,
        frameHeight: 32,
        fps: 12,
        frameCount: 0
      };

      const fakeResolver = {
        loadManifest: async () => Promise.resolve(),
        resolve: () => resolvedStrip
      } as unknown as AssetResolverService;

      const preloader = new AssetPreloaderService(fakeResolver);
      const loaded = await preloader.preloadResolvedAsset("fx.auto_attack.hit");

      expect(loaded.resolved.type).toBe("anim_strip");
      expect(loaded.resolved.frameCount).toBe(3);
      expect(loaded.image.width).toBe(96);
    });

    it("computes frameCount for anim_strip_rows and keeps rowCount", async () => {
      const resolvedRows: ResolvedAsset = {
        id: "fx.hit.base",
        type: "anim_strip_rows",
        url: "/assets/test-pack/fx/rows.png",
        frameWidth: 32,
        frameHeight: 32,
        fps: 12,
        rowCount: 9,
        frameCount: 0
      };

      const fakeResolver = {
        loadManifest: async () => Promise.resolve(),
        resolve: () => resolvedRows
      } as unknown as AssetResolverService;

      const preloader = new AssetPreloaderService(fakeResolver);
      const loaded = await preloader.preloadResolvedAsset("fx.hit.base");

      expect(loaded.resolved.type).toBe("anim_strip_rows");
      expect(loaded.resolved.frameCount).toBe(3);
      expect(loaded.resolved.rowCount).toBe(9);
      expect(loaded.image.width).toBe(96);
    });
  });
});
