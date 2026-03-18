import { ArenaScene, ElementTypeValue, RenderLayer } from "../engine/arena-engine.types";
import {
  COMBAT_FX_DEATH_BURST,
  COMBAT_FX_MELEE_SWING,
  COMBAT_FX_RANGED_PROJECTILE,
  computeNormalizedProgress,
  interpolateLinear
} from "../engine/attack-fx.helpers";
import { computeDecalFadeAlpha } from "../engine/decal.helpers";
import { PreloadedAsset } from "../assets/asset-manifest.types";
import { getMobArchetypeAccentColor } from "../engine/mob-visuals";
import { ProjectileAnimator } from "./projectile-animator";
const PHYSICAL_ELEMENT: ElementTypeValue = 6;
const FLOATING_NUMBER_PALETTE = {
  damageReceivedRed: "#ef4444",
  healNeonGreen: "#39ff14",
  shieldGainBlue: "#93c5fd",
  shieldLossBlue: "#3b82f6",
  outline: "rgba(10, 10, 10, 0.95)",
  element: {
    1: "#ff9f2d", // Fire
    2: "#7dd3fc", // Ice
    3: "#a78bfa", // Energy
    4: "#166534", // Earth
    5: "#fde68a", // Holy
    6: "#ffffff", // Physical
    7: "#4c1d95", // Shadow-like
    8: "#ef4444",
    9: "#4c1d95"
  } as Record<ElementTypeValue, string>
} as const;
const CRIT_TEXT_PALETTE = {
  fill: "#fde047",
  outline: "rgba(15, 23, 42, 0.95)"
} as const;

export class CanvasLayeredRenderer {
  private readonly pipeline: RenderLayer[] = ["ground", "groundFx", "actors", "hitFx", "ui"];
  private readonly warnedMissingAssetIds = new Set<string>();
  private readonly missingAssetIds = new Set<string>();
  private readonly projectileAnimator = new ProjectileAnimator();

  constructor(private readonly context: CanvasRenderingContext2D) {}

  async render(
    scene: ArenaScene,
    imageLoader: (semanticId: string) => Promise<PreloadedAsset>
  ): Promise<void> {
    const viewport = this.getViewport(scene);
    this.clear(viewport);
    const imageCache = new Map<string, Promise<PreloadedAsset | null>>();

    for (const layer of this.pipeline) {
      if (layer === "ground") {
        const groundTiles = scene.tiles.filter((tile) => tile.layer === "ground");
        for (const tile of groundTiles) {
          const destX = viewport.originX + tile.tilePos.x * scene.tileSize;
          const destY = viewport.originY + tile.tilePos.y * scene.tileSize;
          const loaded = await this.getAsset(imageCache, tile.semanticId, imageLoader);
          if (!loaded) {
            this.drawDebugMissingRect(destX, destY, scene.tileSize, scene.tileSize);
            continue;
          }

          this.drawResolvedAsset(loaded, destX, destY, scene.tileSize, scene.tileSize);
        }

        this.drawGrid(scene, viewport);
        continue;
      }

      if (layer === "actors") {
        const actors = scene.sprites.filter((sprite) => sprite.layer === "actors");
        for (const actor of actors) {
          const spriteSize = scene.tileSize * 0.88;
          const destX = viewport.originX + actor.tilePos.x * scene.tileSize + (scene.tileSize - spriteSize) / 2;
          const destY = viewport.originY + actor.tilePos.y * scene.tileSize + (scene.tileSize - spriteSize) / 2;
          const loaded = await this.getAsset(imageCache, actor.semanticId, imageLoader);
          if (!loaded) {
            this.drawDebugMissingRect(destX, destY, spriteSize, spriteSize);
            continue;
          }

          this.drawResolvedAsset(loaded, destX, destY, spriteSize, spriteSize, actor.animationElapsedMs);
        }

        this.drawMobHpBars(scene, viewport);
        continue;
      }

      if (layer === "groundFx" || layer === "hitFx") {
        if (layer === "groundFx") {
          for (const decal of scene.decals) {
            const loaded = await this.getAsset(imageCache, decal.semanticId, imageLoader);
            if (!loaded) {
              const x = viewport.originX + decal.tilePos.x * scene.tileSize;
              const y = viewport.originY + decal.tilePos.y * scene.tileSize;
              this.drawDebugMissingRect(x, y, scene.tileSize, scene.tileSize);
              continue;
            }

            this.drawDecal(scene, viewport, loaded, decal);
          }
        }

        const fxEntries = scene.fxInstances.filter((fx) => fx.layer === layer);
        for (const fx of fxEntries) {
          const loaded = await this.getAsset(imageCache, fx.fxId, imageLoader);
          if (!loaded) {
            const x = viewport.originX + fx.tilePos.x * scene.tileSize;
            const y = viewport.originY + fx.tilePos.y * scene.tileSize;
            this.drawDebugMissingRect(x, y, scene.tileSize, scene.tileSize);
            continue;
          }

          this.drawFx(scene, viewport, loaded, fx.tilePos.x, fx.tilePos.y, fx.elapsedMs, fx.durationMs, fx.startFrame, fx.element);
        }

        if (layer === "hitFx") {
          for (const attackFx of scene.attackFxInstances) {
            this.drawAttackFx(scene, viewport, attackFx);
          }

          for (const projectile of scene.projectileInstances) {
            if ((projectile.startDelayRemainingMs ?? 0) > 0) {
              continue;
            }

            this.projectileAnimator.draw(
              this.context,
              scene,
              viewport.originX,
              viewport.originY,
              projectile
            );
          }
        }

        continue;
      }

      if (layer === "ui") {
        this.drawPoiMarkers(scene, viewport);
        this.drawAimDirectionGuides(scene, viewport);
        this.drawGroundTargetReticle(scene, viewport);
        this.drawLockedTargetMarker(scene, viewport);
        this.drawMobReadabilityMarkers(scene, viewport);
        this.drawThreatTargetMarker(scene, viewport);
        this.drawDamageNumbers(scene, viewport);
        this.drawFloatingTexts(scene, viewport);
      }
    }
  }

  private clear(viewport: RenderViewport): void {
    this.context.clearRect(0, 0, viewport.canvasWidth, viewport.canvasHeight);
  }

  private drawGrid(scene: ArenaScene, viewport: RenderViewport): void {
    this.context.strokeStyle = "rgba(148, 163, 184, 0.35)";
    this.context.lineWidth = 1;

    for (let x = 0; x <= scene.columns; x += 1) {
      this.context.beginPath();
      this.context.moveTo(viewport.originX + x * scene.tileSize, viewport.originY);
      this.context.lineTo(viewport.originX + x * scene.tileSize, viewport.originY + scene.rows * scene.tileSize);
      this.context.stroke();
    }

    for (let y = 0; y <= scene.rows; y += 1) {
      this.context.beginPath();
      this.context.moveTo(viewport.originX, viewport.originY + y * scene.tileSize);
      this.context.lineTo(viewport.originX + scene.columns * scene.tileSize, viewport.originY + y * scene.tileSize);
      this.context.stroke();
    }
  }

  private drawFx(
    scene: ArenaScene,
    viewport: RenderViewport,
    loaded: PreloadedAsset,
    tileX: number,
    tileY: number,
    elapsedMs: number,
    durationMs: number,
    startFrame: number,
    element = PHYSICAL_ELEMENT
  ): void {
    const tileCenterX = viewport.originX + tileX * scene.tileSize + scene.tileSize / 2;
    const tileCenterY = viewport.originY + tileY * scene.tileSize + scene.tileSize / 2;
    const normalizedLife = Math.max(0, Math.min(1, elapsedMs / durationMs));
    const scale = 1;
    const size = scene.tileSize * scale;
    const alpha = Math.max(0.2, 1 - normalizedLife * 0.85);

    this.context.save();
    this.context.globalAlpha = alpha;
    this.drawResolvedAsset(
      loaded,
      tileCenterX - size / 2,
      tileCenterY - size / 2,
      size,
      size,
      elapsedMs,
      startFrame,
      element
    );
    this.context.restore();
  }

  private drawAttackFx(scene: ArenaScene, viewport: RenderViewport, attackFx: ArenaScene["attackFxInstances"][number]): void {
    if (attackFx.fxKind === COMBAT_FX_RANGED_PROJECTILE) {
      this.drawRangedProjectileFx(scene, viewport, attackFx);
      return;
    }

    if (attackFx.fxKind === COMBAT_FX_MELEE_SWING) {
      this.drawMeleeSwingFx(scene, viewport, attackFx);
      return;
    }

    if (attackFx.fxKind === COMBAT_FX_DEATH_BURST) {
      this.drawDeathBurstFx(scene, viewport, attackFx);
      return;
    }

    this.drawImpactPulseFx(scene, viewport, attackFx);
  }

  private drawDecal(
    scene: ArenaScene,
    viewport: RenderViewport,
    loaded: PreloadedAsset,
    decal: ArenaScene["decals"][number]
  ): void {
    const size = scene.tileSize * 0.86;
    const x = viewport.originX + decal.tilePos.x * scene.tileSize + (scene.tileSize - size) / 2;
    const y = viewport.originY + decal.tilePos.y * scene.tileSize + (scene.tileSize - size) / 2;

    this.context.save();
    this.context.globalAlpha = computeDecalFadeAlpha(decal.remainingMs, decal.totalMs);
    this.drawResolvedAsset(loaded, x, y, size, size);
    this.context.restore();
  }

  private drawRangedProjectileFx(scene: ArenaScene, viewport: RenderViewport, attackFx: ArenaScene["attackFxInstances"][number]): void {
    const progress = computeNormalizedProgress(attackFx.elapsedMs, attackFx.durationMs);
    const fromX = viewport.originX + (attackFx.fromPos.x + 0.5) * scene.tileSize;
    const fromY = viewport.originY + (attackFx.fromPos.y + 0.5) * scene.tileSize;
    const toX = viewport.originX + (attackFx.toPos.x + 0.5) * scene.tileSize;
    const toY = viewport.originY + (attackFx.toPos.y + 0.5) * scene.tileSize;
    const projectileX = interpolateLinear(fromX, toX, progress);
    const projectileY = interpolateLinear(fromY, toY, progress);
    const trailProgress = Math.max(0, progress - 0.18);
    const trailX = interpolateLinear(fromX, toX, trailProgress);
    const trailY = interpolateLinear(fromY, toY, trailProgress);
    const radius = Math.max(2, scene.tileSize * 0.12);
    const rgb = this.getElementRgb(attackFx.element);

    this.context.save();
    this.context.lineCap = "round";
    this.context.strokeStyle = this.colorWithAlpha(rgb, 0.6);
    this.context.lineWidth = Math.max(2, scene.tileSize * 0.07);
    this.context.beginPath();
    this.context.moveTo(trailX, trailY);
    this.context.lineTo(projectileX, projectileY);
    this.context.stroke();

    this.context.fillStyle = this.colorWithAlpha(rgb, 0.95);
    this.context.beginPath();
    this.context.arc(projectileX, projectileY, radius, 0, Math.PI * 2);
    this.context.fill();
    this.context.restore();
  }

  private drawMeleeSwingFx(scene: ArenaScene, viewport: RenderViewport, attackFx: ArenaScene["attackFxInstances"][number]): void {
    const progress = computeNormalizedProgress(attackFx.elapsedMs, attackFx.durationMs);
    const targetCenterX = viewport.originX + (attackFx.toPos.x + 0.5) * scene.tileSize;
    const targetCenterY = viewport.originY + (attackFx.toPos.y + 0.5) * scene.tileSize;
    const directionX = Math.cos(attackFx.directionAngleRad);
    const directionY = Math.sin(attackFx.directionAngleRad);
    const perpendicularX = Math.cos(attackFx.directionAngleRad + Math.PI / 2);
    const perpendicularY = Math.sin(attackFx.directionAngleRad + Math.PI / 2);
    const centerX = targetCenterX - directionX * scene.tileSize * 0.12;
    const centerY = targetCenterY - directionY * scene.tileSize * 0.12;
    const halfSlashLength = scene.tileSize * (0.18 + (1 - progress) * 0.18);
    const startX = centerX - perpendicularX * halfSlashLength;
    const startY = centerY - perpendicularY * halfSlashLength;
    const endX = centerX + perpendicularX * halfSlashLength;
    const endY = centerY + perpendicularY * halfSlashLength;
    const alpha = Math.max(0.12, 1 - progress);
    const rgb = this.getElementRgb(attackFx.element);

    this.context.save();
    this.context.lineCap = "round";
    this.context.strokeStyle = this.colorWithAlpha(rgb, 0.9 * alpha);
    this.context.lineWidth = Math.max(2, scene.tileSize * 0.09);
    this.context.beginPath();
    this.context.moveTo(startX, startY);
    this.context.lineTo(endX, endY);
    this.context.stroke();

    this.context.strokeStyle = this.colorWithAlpha([255, 255, 255], 0.55 * alpha);
    this.context.lineWidth = Math.max(1.5, scene.tileSize * 0.045);
    this.context.beginPath();
    this.context.moveTo(startX, startY);
    this.context.lineTo(endX, endY);
    this.context.stroke();
    this.context.restore();
  }

  private drawImpactPulseFx(scene: ArenaScene, viewport: RenderViewport, attackFx: ArenaScene["attackFxInstances"][number]): void {
    const progress = computeNormalizedProgress(attackFx.elapsedMs, attackFx.durationMs);
    const centerX = viewport.originX + (attackFx.toPos.x + 0.5) * scene.tileSize;
    const centerY = viewport.originY + (attackFx.toPos.y + 0.5) * scene.tileSize;
    const radius = scene.tileSize * (0.12 + progress * 0.2);
    const alpha = Math.max(0.1, 0.7 * (1 - progress));
    const rgb = this.getElementRgb(attackFx.element);

    this.context.save();
    this.context.fillStyle = this.colorWithAlpha(rgb, alpha);
    this.context.beginPath();
    this.context.arc(centerX, centerY, radius, 0, Math.PI * 2);
    this.context.fill();
    this.context.restore();
  }

  private drawDeathBurstFx(scene: ArenaScene, viewport: RenderViewport, attackFx: ArenaScene["attackFxInstances"][number]): void {
    const progress = computeNormalizedProgress(attackFx.elapsedMs, attackFx.durationMs);
    const centerX = viewport.originX + (attackFx.toPos.x + 0.5) * scene.tileSize;
    const centerY = viewport.originY + (attackFx.toPos.y + 0.5) * scene.tileSize;
    const radius = scene.tileSize * (0.16 + progress * 0.45);
    const alpha = Math.max(0.1, 0.85 * (1 - progress));
    const rgb = this.getElementRgb(attackFx.element);

    this.context.save();
    this.context.fillStyle = this.colorWithAlpha(rgb, 0.2 * alpha);
    this.context.beginPath();
    this.context.arc(centerX, centerY, radius * 1.2, 0, Math.PI * 2);
    this.context.fill();

    this.context.strokeStyle = this.colorWithAlpha(rgb, alpha);
    this.context.lineWidth = Math.max(2, scene.tileSize * 0.08);
    this.context.beginPath();
    this.context.arc(centerX, centerY, radius, 0, Math.PI * 2);
    this.context.stroke();
    this.context.restore();
  }

  private async getAsset(
    cache: Map<string, Promise<PreloadedAsset | null>>,
    semanticId: string,
    imageLoader: (semanticId: string) => Promise<PreloadedAsset>
  ): Promise<PreloadedAsset | null> {
    if (this.missingAssetIds.has(semanticId)) {
      return null;
    }

    const cached = cache.get(semanticId);
    if (cached) {
      return cached;
    }

    const loaded = imageLoader(semanticId).catch((error) => {
      this.missingAssetIds.add(semanticId);
      if (!this.warnedMissingAssetIds.has(semanticId)) {
        this.warnedMissingAssetIds.add(semanticId);
        console.warn(`[CanvasLayeredRenderer] Missing asset '${semanticId}'.`, error);
      }

      return null;
    });

    cache.set(semanticId, loaded);
    return loaded;
  }

  private drawResolvedAsset(
    loaded: PreloadedAsset,
    destX: number,
    destY: number,
    destW: number,
    destH: number,
    elapsedMs = 0,
    startFrame = 0,
    element: ElementTypeValue = PHYSICAL_ELEMENT
  ): void {
    const { image, resolved } = loaded;
    if (resolved.type === "sheet" && resolved.frame) {
      this.context.drawImage(
        image,
        resolved.frame.x,
        resolved.frame.y,
        resolved.frame.w,
        resolved.frame.h,
        destX,
        destY,
        destW,
        destH
      );
      return;
    }

    if (resolved.type === "anim") {
      const frames = loaded.frames ?? [image];
      const frameIndex = this.getAnimFrameIndex(elapsedMs, resolved.fps ?? 12, frames.length, startFrame);
      const frameImage = frames[frameIndex] ?? image;
      this.context.drawImage(frameImage, destX, destY, destW, destH);
      return;
    }

    if (resolved.type === "anim_strip") {
      const frameWidth = Math.max(1, Math.floor(resolved.frameWidth ?? image.width));
      const frameHeight = Math.max(1, Math.floor(resolved.frameHeight ?? image.height));
      const declaredFrameCount = Math.max(0, Math.floor(resolved.frameCount ?? 0));
      const computedFrameCount = Math.floor(image.width / frameWidth);
      const frameCount = Math.max(1, declaredFrameCount > 0 ? declaredFrameCount : computedFrameCount);
      const frameIndex = this.getAnimFrameIndex(elapsedMs, resolved.fps ?? 12, frameCount, startFrame);
      const sx = Math.min(image.width - frameWidth, frameIndex * frameWidth);

      this.context.drawImage(
        image,
        Math.max(0, sx),
        0,
        frameWidth,
        frameHeight,
        destX,
        destY,
        destW,
        destH
      );
      return;
    }

    if (resolved.type === "anim_strip_rows") {
      const frameWidth = Math.max(1, Math.floor(resolved.frameWidth ?? image.width));
      const frameHeight = Math.max(1, Math.floor(resolved.frameHeight ?? image.height));
      const declaredFrameCount = Math.max(0, Math.floor(resolved.frameCount ?? 0));
      const computedFrameCount = Math.floor(image.width / frameWidth);
      const frameCount = Math.max(1, declaredFrameCount > 0 ? declaredFrameCount : computedFrameCount);
      const rowCount = Math.max(1, Math.floor(resolved.rowCount ?? Math.floor(image.height / frameHeight)));
      const rowIndex = Math.min(rowCount, Math.max(1, element));
      const frameIndex = this.getAnimFrameIndex(elapsedMs, resolved.fps ?? 12, frameCount, startFrame);
      const sx = Math.min(image.width - frameWidth, frameIndex * frameWidth);
      const sy = Math.min(image.height - frameHeight, (rowIndex - 1) * frameHeight);

      this.context.drawImage(
        image,
        Math.max(0, sx),
        Math.max(0, sy),
        frameWidth,
        frameHeight,
        destX,
        destY,
        destW,
        destH
      );
      return;
    }

    this.context.drawImage(image, destX, destY, destW, destH);
  }

  private getAnimFrameIndex(elapsedMs: number, fps: number, frameCount: number, startFrame = 0): number {
    if (frameCount <= 1) {
      return 0;
    }

    const safeFps = Math.max(1, fps);
    const frameDurationMs = 1000 / safeFps;
    const elapsedFrames = Math.floor(Math.max(0, elapsedMs) / frameDurationMs);
    const baseOffset = Math.max(0, startFrame);
    return (elapsedFrames + baseOffset) % frameCount;
  }

  private drawDebugMissingRect(x: number, y: number, width: number, height: number): void {
    this.context.save();
    this.context.fillStyle = "rgba(255, 0, 128, 0.55)";
    this.context.fillRect(x, y, width, height);
    this.context.strokeStyle = "#fee2e2";
    this.context.lineWidth = 2;
    this.context.strokeRect(x + 1, y + 1, Math.max(2, width - 2), Math.max(2, height - 2));
    this.context.restore();
  }

  private getElementRgb(element: ElementTypeValue): [number, number, number] {
    switch (element) {
      case 1:
        return [245, 158, 11];
      case 2:
        return [56, 189, 248];
      case 3:
        return [125, 211, 252];
      case 4:
        return [52, 211, 153];
      case 5:
        return [250, 204, 21];
      case 7:
        return [251, 113, 133];
      case 8:
        return [248, 113, 113];
      case 9:
        return [192, 132, 252];
      default:
        return [248, 250, 252];
    }
  }

  private colorWithAlpha(rgb: [number, number, number], alpha: number): string {
    return `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${Math.max(0, Math.min(1, alpha))})`;
  }

  private drawMobHpBars(scene: ArenaScene, viewport: RenderViewport): void {
    const mobs = Object.values(scene.actorsById).filter((actor) => actor.kind === "mob");
    for (const mob of mobs) {
      const ratio = mob.maxHp > 0 ? Math.max(0, Math.min(1, mob.hp / mob.maxHp)) : 0;
      const barWidth = scene.tileSize * 0.78;
      const barHeight = Math.max(4, scene.tileSize * 0.1);
      const originX = viewport.originX + mob.tileX * scene.tileSize + (scene.tileSize - barWidth) / 2;
      const originY = viewport.originY + mob.tileY * scene.tileSize - barHeight - 5;

      this.context.save();
      this.context.fillStyle = "rgba(15, 23, 42, 0.9)";
      this.context.fillRect(originX, originY, barWidth, barHeight);
      this.context.strokeStyle = getMobArchetypeAccentColor(mob.mobType);
      this.context.lineWidth = 1;
      this.context.strokeRect(originX - 0.5, originY - 0.5, barWidth + 1, barHeight + 1);

      this.context.fillStyle = ratio > 0.4 ? "#22c55e" : ratio > 0.2 ? "#f59e0b" : "#ef4444";
      this.context.fillRect(originX + 1, originY + 1, (barWidth - 2) * ratio, barHeight - 2);
      this.context.restore();
    }
  }

  private drawDamageNumbers(scene: ArenaScene, viewport: RenderViewport): void {
    for (const entry of scene.damageNumbers) {
      const life = Math.max(0, Math.min(1, entry.elapsedMs / entry.durationMs));
      const riseOffset = life * scene.tileSize * 0.62;
      const x = viewport.originX + entry.tilePos.x * scene.tileSize + scene.tileSize / 2 + this.computeStackOffsetX(scene, entry.stackIndex, entry.spawnOrder);
      const y = viewport.originY + entry.tilePos.y * scene.tileSize + scene.tileSize * 0.18 - riseOffset - this.computeStackOffsetY(scene, entry.stackIndex);
      const baseFontSizePx = this.computeDamageNumberFontSizePx(scene);
      const fontSizePx = this.computeDamageNumberEntryFontSizePx(baseFontSizePx, entry, life);
      const outlineWidth = this.computeDamageNumberOutlineWidthPx(fontSizePx, entry);
      const text = this.formatDamageNumberText(entry);

      this.context.save();
      this.context.globalAlpha = Math.max(0.15, 1 - life);
      this.context.textAlign = "center";
      this.context.textBaseline = "middle";
      this.context.font = `bold ${fontSizePx}px Arial`;
      this.context.fillStyle = this.resolveDamageNumberFillColor(entry);
      this.context.strokeStyle = FLOATING_NUMBER_PALETTE.outline;
      this.context.lineWidth = outlineWidth;
      this.context.lineJoin = "round";
      this.context.strokeText(text, x, y);
      this.context.fillText(text, x, y);
      this.context.restore();
    }
  }

  private drawFloatingTexts(scene: ArenaScene, viewport: RenderViewport): void {
    for (const entry of scene.floatingTexts) {
      if (entry.kind !== "crit_text") {
        continue;
      }

      const life = Math.max(0, Math.min(1, entry.elapsedMs / entry.durationMs));
      const riseOffset = life * scene.tileSize * 0.45;
      const x = viewport.originX + (entry.tilePos.x + 0.5) * scene.tileSize;
      const y = viewport.originY + entry.tilePos.y * scene.tileSize - scene.tileSize * 0.12 - riseOffset;
      const baseFontPx = Math.max(16, Math.min(24, scene.tileSize * 0.42));
      const fontSizePx = Math.round(baseFontPx * (1 + (1 - life) * 0.08));

      this.context.save();
      this.context.globalAlpha = Math.max(0.1, 1 - life);
      this.context.textAlign = "center";
      this.context.textBaseline = "middle";
      this.context.font = `bold ${fontSizePx}px Arial`;
      this.context.fillStyle = CRIT_TEXT_PALETTE.fill;
      this.context.strokeStyle = CRIT_TEXT_PALETTE.outline;
      this.context.lineWidth = Math.max(2, Math.round(fontSizePx * 0.18));
      this.context.lineJoin = "round";
      this.context.strokeText(entry.text, x, y);
      this.context.fillText(entry.text, x, y);
      this.context.restore();
    }
  }

  private computeDamageNumberFontSizePx(scene: ArenaScene): number {
    const transform = this.context.getTransform();
    const transformScale = Math.max(1, (Math.abs(transform.a) + Math.abs(transform.d)) / 2);
    const scaled = scene.tileSize * 0.36;
    const clamped = Math.max(16, Math.min(18, scaled));
    // Quantize to device scale to keep outlines crisp with DPR-scaled canvases.
    return Math.round(clamped * transformScale) / transformScale;
  }

  private computeDamageNumberEntryFontSizePx(
    baseFontSizePx: number,
    entry: ArenaScene["damageNumbers"][number],
    life: number
  ): number {
    const critMultiplier = entry.isCrit ? 1.25 : 1;
    const critPopScale = entry.isCrit ? 1 + (1 - life) * 0.06 : 1;
    return Math.round(baseFontSizePx * critMultiplier * critPopScale);
  }

  private computeDamageNumberOutlineWidthPx(fontSizePx: number, entry: ArenaScene["damageNumbers"][number]): number {
    const base = Math.max(3, Math.round(fontSizePx * 0.26));
    if (entry.isHeal) {
      return base + 1;
    }

    if (entry.isCrit) {
      return base + 1.5;
    }

    return base;
  }

  private resolveDamageNumberFillColor(entry: ArenaScene["damageNumbers"][number]): string {
    if (entry.isHeal) {
      return FLOATING_NUMBER_PALETTE.healNeonGreen;
    }

    if (entry.isShieldChange && entry.shieldChangeDirection === "gain") {
      return FLOATING_NUMBER_PALETTE.shieldGainBlue;
    }

    if (entry.isShieldChange && entry.shieldChangeDirection === "loss") {
      return FLOATING_NUMBER_PALETTE.shieldLossBlue;
    }

    if (entry.isDamageReceived) {
      return FLOATING_NUMBER_PALETTE.damageReceivedRed;
    }

    return this.resolveElementDamageColor(entry.element);
  }

  private resolveElementDamageColor(element: ElementTypeValue): string {
    return FLOATING_NUMBER_PALETTE.element[element] ?? FLOATING_NUMBER_PALETTE.element[PHYSICAL_ELEMENT];
  }

  private computeStackOffsetX(scene: ArenaScene, stackIndex: number, spawnOrder: number): number {
    const slot = stackIndex % 4;
    const laneDirection = slot % 2 === 0 ? -1 : 1;
    const laneMagnitude = Math.floor(slot / 2) + 1;
    const laneOffset = laneDirection * laneMagnitude * (scene.tileSize * 0.055);
    const jitterSeed = (spawnOrder * 1103515245 + 12345) >>> 0;
    const jitterStep = ((jitterSeed >>> 5) % 3) - 1;
    const jitterOffset = jitterStep * (scene.tileSize * 0.018);
    return laneOffset + jitterOffset;
  }

  private computeStackOffsetY(scene: ArenaScene, stackIndex: number): number {
    const slot = stackIndex % 4;
    const row = Math.floor(stackIndex / 4);
    const perSlotOffset = slot * (scene.tileSize * 0.15);
    const perRowOffset = row * (scene.tileSize * 0.1);
    return perSlotOffset + perRowOffset;
  }

  private formatDamageNumberText(entry: ArenaScene["damageNumbers"][number]): string {
    if (entry.isHeal || (entry.isShieldChange && entry.shieldChangeDirection === "gain")) {
      return `+${entry.amount}`;
    }

    return `${entry.amount}`;
  }

  private drawPoiMarkers(scene: ArenaScene, viewport: RenderViewport): void {
    if (scene.activePois.length === 0) {
      return;
    }

    const player = Object.values(scene.actorsById).find((actor) => actor.kind === "player");
    const playerTileX = player?.tileX ?? scene.playerTile.x;
    const playerTileY = player?.tileY ?? scene.playerTile.y;

    for (const poi of scene.activePois) {
      const centerX = viewport.originX + (poi.pos.x + 0.5) * scene.tileSize;
      const centerY = viewport.originY + (poi.pos.y + 0.5) * scene.tileSize;
      const chebyshevDistance = Math.max(Math.abs(poi.pos.x - playerTileX), Math.abs(poi.pos.y - playerTileY));
      const isInteractable = chebyshevDistance <= 1;

      this.context.save();
      if (poi.type === "chest" || poi.type === "species_chest") {
        this.drawChestPoiMarker(scene.tileSize, centerX, centerY, poi.type === "species_chest");
      } else {
        this.drawAltarPoiMarker(scene.tileSize, centerX, centerY);
      }

      if (isInteractable) {
        this.context.strokeStyle = "rgba(251, 191, 36, 0.95)";
        this.context.lineWidth = Math.max(2, scene.tileSize * 0.06);
        this.context.beginPath();
        this.context.arc(centerX, centerY, scene.tileSize * 0.33, 0, Math.PI * 2);
        this.context.stroke();
      }
      this.context.restore();
    }
  }

  private drawPoiKeyHint(tileSize: number, centerX: number, centerY: number): void {
    const hintWidth = tileSize * 0.32;
    const hintHeight = tileSize * 0.22;
    const x = centerX - hintWidth / 2;
    const y = centerY - tileSize * 0.54;

    this.context.fillStyle = "rgba(15, 23, 42, 0.9)";
    this.context.fillRect(x, y, hintWidth, hintHeight);
    this.context.strokeStyle = "rgba(251, 191, 36, 0.95)";
    this.context.lineWidth = Math.max(1.5, tileSize * 0.03);
    this.context.strokeRect(x, y, hintWidth, hintHeight);

    this.context.fillStyle = "rgba(254, 243, 199, 0.95)";
    this.context.font = `bold ${Math.max(9, Math.floor(tileSize * 0.18))}px monospace`;
    this.context.textAlign = "center";
    this.context.textBaseline = "middle";
    this.context.fillText("F", centerX, y + hintHeight / 2);
  }

  private drawChestPoiMarker(tileSize: number, centerX: number, centerY: number, isSpeciesChest: boolean): void {
    const width = tileSize * 0.52;
    const height = tileSize * 0.34;
    const x = centerX - width / 2;
    const y = centerY - height / 2;

    this.context.fillStyle = isSpeciesChest ? "rgba(30, 64, 175, 0.9)" : "rgba(120, 53, 15, 0.92)";
    this.context.fillRect(x, y, width, height);
    this.context.strokeStyle = isSpeciesChest ? "rgba(147, 197, 253, 0.95)" : "rgba(245, 158, 11, 0.95)";
    this.context.lineWidth = Math.max(1.5, tileSize * 0.04);
    this.context.strokeRect(x, y, width, height);

    this.context.fillStyle = isSpeciesChest ? "rgba(219, 234, 254, 0.95)" : "rgba(251, 191, 36, 0.95)";
    this.context.fillRect(centerX - tileSize * 0.035, y + height * 0.24, tileSize * 0.07, height * 0.52);

    if (isSpeciesChest) {
      this.context.fillStyle = "rgba(15, 23, 42, 0.95)";
      this.context.font = `${Math.max(9, Math.floor(tileSize * 0.2))}px monospace`;
      this.context.textAlign = "center";
      this.context.textBaseline = "middle";
      this.context.fillText("S", centerX, y + height * 0.2);
    }
  }

  private drawAltarPoiMarker(tileSize: number, centerX: number, centerY: number): void {
    const radius = tileSize * 0.22;
    this.context.fillStyle = "rgba(14, 116, 144, 0.88)";
    this.context.beginPath();
    this.context.moveTo(centerX, centerY - radius);
    this.context.lineTo(centerX + radius, centerY);
    this.context.lineTo(centerX, centerY + radius);
    this.context.lineTo(centerX - radius, centerY);
    this.context.closePath();
    this.context.fill();

    this.context.strokeStyle = "rgba(103, 232, 249, 0.95)";
    this.context.lineWidth = Math.max(1.5, tileSize * 0.04);
    this.context.stroke();

    this.context.fillStyle = "rgba(207, 250, 254, 0.95)";
    this.context.beginPath();
    this.context.arc(centerX, centerY, tileSize * 0.07, 0, Math.PI * 2);
    this.context.fill();
  }

  private drawAimDirectionGuides(scene: ArenaScene, viewport: RenderViewport): void {
    const player = Object.values(scene.actorsById).find((actor) => actor.kind === "player");
    if (!player) {
      return;
    }

    const playerCenterX = viewport.originX + (player.tileX + 0.5) * scene.tileSize;
    const playerCenterY = viewport.originY + (player.tileY + 0.5) * scene.tileSize;

    if (scene.groundTargetPos) {
      const tileX = scene.groundTargetPos.x;
      const tileY = scene.groundTargetPos.y;
      if (tileX >= 0 && tileY >= 0 && tileX < scene.columns && tileY < scene.rows) {
        const targetCenterX = viewport.originX + (tileX + 0.5) * scene.tileSize;
        const targetCenterY = viewport.originY + (tileY + 0.5) * scene.tileSize;
        this.drawDirectionalGuide(playerCenterX, playerCenterY, targetCenterX, targetCenterY, "rgba(56, 189, 248, 0.65)");
      }
    }

    if (scene.effectiveTargetEntityId) {
      const effectiveTarget = scene.actorsById[scene.effectiveTargetEntityId];
      if (effectiveTarget && effectiveTarget.kind === "mob") {
        const targetCenterX = viewport.originX + (effectiveTarget.tileX + 0.5) * scene.tileSize;
        const targetCenterY = viewport.originY + (effectiveTarget.tileY + 0.5) * scene.tileSize;
        this.drawDirectionalGuide(playerCenterX, playerCenterY, targetCenterX, targetCenterY, "rgba(248, 113, 113, 0.65)");
      }
    }
  }

  private drawDirectionalGuide(fromX: number, fromY: number, toX: number, toY: number, color: string): void {
    const deltaX = toX - fromX;
    const deltaY = toY - fromY;
    const distance = Math.hypot(deltaX, deltaY);
    if (distance < 0.001) {
      return;
    }

    const angle = Math.atan2(deltaY, deltaX);
    const arrowLength = 8;
    const arrowWidth = 5;

    this.context.save();
    this.context.strokeStyle = color;
    this.context.lineWidth = 2;
    this.context.setLineDash([4, 4]);
    this.context.beginPath();
    this.context.moveTo(fromX, fromY);
    this.context.lineTo(toX, toY);
    this.context.stroke();
    this.context.setLineDash([]);

    this.context.fillStyle = color;
    this.context.beginPath();
    this.context.moveTo(toX, toY);
    this.context.lineTo(
      toX - arrowLength * Math.cos(angle) + arrowWidth * Math.sin(angle),
      toY - arrowLength * Math.sin(angle) - arrowWidth * Math.cos(angle)
    );
    this.context.lineTo(
      toX - arrowLength * Math.cos(angle) - arrowWidth * Math.sin(angle),
      toY - arrowLength * Math.sin(angle) + arrowWidth * Math.cos(angle)
    );
    this.context.closePath();
    this.context.fill();
    this.context.restore();
  }

  private drawLockedTargetMarker(scene: ArenaScene, viewport: RenderViewport): void {
    if (!scene.effectiveTargetEntityId) {
      return;
    }

    const effectiveTarget = scene.actorsById[scene.effectiveTargetEntityId];
    if (!effectiveTarget || effectiveTarget.kind !== "mob") {
      return;
    }

    const centerX = viewport.originX + (effectiveTarget.tileX + 0.5) * scene.tileSize;
    const centerY = viewport.originY + (effectiveTarget.tileY + 0.5) * scene.tileSize;
    const radius = scene.tileSize * 0.48;
    const markerSize = scene.tileSize * 0.16;

    this.context.save();
    this.context.fillStyle = "rgba(248, 113, 113, 0.18)";
    this.context.beginPath();
    this.context.arc(centerX, centerY, radius, 0, Math.PI * 2);
    this.context.fill();

    this.context.strokeStyle = "rgba(248, 113, 113, 0.95)";
    this.context.lineWidth = Math.max(2.5, scene.tileSize * 0.06);
    this.context.beginPath();
    this.context.arc(centerX, centerY, radius, 0, Math.PI * 2);
    this.context.stroke();

    this.context.fillStyle = "rgba(248, 113, 113, 0.95)";
    this.context.beginPath();
    this.context.moveTo(centerX, centerY - radius - markerSize);
    this.context.lineTo(centerX - markerSize * 0.72, centerY - radius - markerSize * 2);
    this.context.lineTo(centerX + markerSize * 0.72, centerY - radius - markerSize * 2);
    this.context.closePath();
    this.context.fill();
    this.context.restore();
  }

  private drawMobReadabilityMarkers(scene: ArenaScene, viewport: RenderViewport): void {
    const mobs = Object.values(scene.actorsById).filter((actor) => actor.kind === "mob");
    if (mobs.length === 0) {
      return;
    }

    this.drawEliteBuffLinkHints(scene, viewport, mobs);

    for (const mob of mobs) {
      const centerX = viewport.originX + (mob.tileX + 0.5) * scene.tileSize;
      const centerY = viewport.originY + (mob.tileY + 0.5) * scene.tileSize;

      if (mob.isElite === true) {
        this.drawEliteMarker(scene.tileSize, centerX, centerY);
        continue;
      }

      const isBuffedByElite = mob.isBuffedByElite === true || !!mob.buffSourceEliteId;
      if (isBuffedByElite) {
        this.drawEliteBuffedMarker(scene.tileSize, centerX, centerY);
      }
    }
  }

  private drawEliteBuffLinkHints(
    scene: ArenaScene,
    viewport: RenderViewport,
    mobs: ReadonlyArray<ArenaScene["actorsById"][string]>
  ): void {
    const focusedMobId = scene.hoveredMobEntityId ?? scene.lockedTargetEntityId;
    if (!focusedMobId) {
      return;
    }

    const focusedMob = scene.actorsById[focusedMobId];
    if (!focusedMob || focusedMob.kind !== "mob") {
      return;
    }

    const links: Array<{ buffed: ArenaScene["actorsById"][string]; elite: ArenaScene["actorsById"][string] }> = [];
    if (focusedMob.isElite === true) {
      for (const mob of mobs) {
        if (mob.actorId === focusedMob.actorId || mob.kind !== "mob") {
          continue;
        }

        if (mob.buffSourceEliteId === focusedMob.actorId) {
          links.push({ buffed: mob, elite: focusedMob });
        }
      }
    } else if (focusedMob.buffSourceEliteId) {
      const elite = scene.actorsById[focusedMob.buffSourceEliteId];
      if (elite && elite.kind === "mob") {
        links.push({ buffed: focusedMob, elite });
      }
    }

    if (links.length === 0) {
      return;
    }

    this.context.save();
    this.context.strokeStyle = "rgba(253, 224, 71, 0.82)";
    this.context.fillStyle = "rgba(253, 224, 71, 0.9)";
    this.context.lineWidth = Math.max(1.5, scene.tileSize * 0.04);
    this.context.setLineDash([scene.tileSize * 0.12, scene.tileSize * 0.08]);
    for (const link of links) {
      const buffedCenterX = viewport.originX + (link.buffed.tileX + 0.5) * scene.tileSize;
      const buffedCenterY = viewport.originY + (link.buffed.tileY + 0.5) * scene.tileSize;
      const eliteCenterX = viewport.originX + (link.elite.tileX + 0.5) * scene.tileSize;
      const eliteCenterY = viewport.originY + (link.elite.tileY + 0.5) * scene.tileSize;

      this.context.beginPath();
      this.context.moveTo(buffedCenterX, buffedCenterY);
      this.context.lineTo(eliteCenterX, eliteCenterY);
      this.context.stroke();

      this.context.beginPath();
      this.context.arc(buffedCenterX, buffedCenterY, Math.max(1.5, scene.tileSize * 0.055), 0, Math.PI * 2);
      this.context.fill();
      this.context.beginPath();
      this.context.arc(eliteCenterX, eliteCenterY, Math.max(2, scene.tileSize * 0.065), 0, Math.PI * 2);
      this.context.fill();
    }
    this.context.setLineDash([]);
    this.context.restore();
  }

  private drawEliteMarker(tileSize: number, centerX: number, centerY: number): void {
    const radius = tileSize * 0.46;
    const iconRadius = tileSize * 0.09;
    const iconCenterY = centerY - radius - tileSize * 0.12;

    this.context.save();
    this.context.fillStyle = "rgba(245, 158, 11, 0.14)";
    this.context.beginPath();
    this.context.arc(centerX, centerY, radius, 0, Math.PI * 2);
    this.context.fill();

    this.context.strokeStyle = "rgba(245, 158, 11, 0.95)";
    this.context.lineWidth = Math.max(2, tileSize * 0.05);
    this.context.beginPath();
    this.context.arc(centerX, centerY, radius, 0, Math.PI * 2);
    this.context.stroke();

    this.context.fillStyle = "rgba(254, 243, 199, 0.95)";
    this.context.beginPath();
    this.context.moveTo(centerX, iconCenterY - iconRadius);
    this.context.lineTo(centerX + iconRadius, iconCenterY);
    this.context.lineTo(centerX, iconCenterY + iconRadius);
    this.context.lineTo(centerX - iconRadius, iconCenterY);
    this.context.closePath();
    this.context.fill();
    this.context.restore();
  }

  private drawEliteBuffedMarker(tileSize: number, centerX: number, centerY: number): void {
    const ringRadius = tileSize * 0.42;
    const dotRadius = tileSize * 0.08;

    this.context.save();
    this.context.strokeStyle = "rgba(253, 224, 71, 0.72)";
    this.context.lineWidth = Math.max(1.5, tileSize * 0.04);
    this.context.beginPath();
    this.context.arc(centerX, centerY, ringRadius, 0, Math.PI * 2);
    this.context.stroke();

    this.context.fillStyle = "rgba(253, 224, 71, 0.95)";
    this.context.beginPath();
    this.context.arc(centerX + ringRadius * 0.7, centerY - ringRadius * 0.35, dotRadius, 0, Math.PI * 2);
    this.context.fill();
    this.context.restore();
  }

  private drawThreatTargetMarker(scene: ArenaScene, viewport: RenderViewport): void {
    if (!scene.threatMobEntityId) {
      return;
    }

    const threatMob = scene.actorsById[scene.threatMobEntityId];
    if (!threatMob || threatMob.kind !== "mob") {
      return;
    }

    const centerX = viewport.originX + (threatMob.tileX + 0.5) * scene.tileSize;
    const centerY = viewport.originY + (threatMob.tileY + 0.5) * scene.tileSize;
    const markerY = centerY - scene.tileSize * 0.45;
    const radius = scene.tileSize * 0.1;

    this.context.save();
    this.context.strokeStyle = "rgba(248, 113, 113, 0.92)";
    this.context.lineWidth = Math.max(1.5, scene.tileSize * 0.04);
    this.context.beginPath();
    this.context.arc(centerX, markerY, radius * 1.35, 0, Math.PI * 2);
    this.context.stroke();

    this.context.fillStyle = "rgba(248, 113, 113, 0.92)";
    this.context.beginPath();
    this.context.arc(centerX, markerY, radius, 0, Math.PI * 2);
    this.context.fill();
    this.context.restore();
  }

  private drawGroundTargetReticle(scene: ArenaScene, viewport: RenderViewport): void {
    if (!scene.groundTargetPos) {
      return;
    }

    const tileX = scene.groundTargetPos.x;
    const tileY = scene.groundTargetPos.y;
    if (tileX < 0 || tileY < 0 || tileX >= scene.columns || tileY >= scene.rows) {
      return;
    }

    const centerX = viewport.originX + (tileX + 0.5) * scene.tileSize;
    const centerY = viewport.originY + (tileY + 0.5) * scene.tileSize;
    const radius = scene.tileSize * 0.36;
    const cross = scene.tileSize * 0.18;

    this.context.save();
    this.context.fillStyle = "rgba(56, 189, 248, 0.16)";
    this.context.beginPath();
    this.context.arc(centerX, centerY, radius, 0, Math.PI * 2);
    this.context.fill();

    this.context.strokeStyle = "rgba(56, 189, 248, 0.95)";
    this.context.lineWidth = Math.max(2.5, scene.tileSize * 0.055);
    this.context.beginPath();
    this.context.arc(centerX, centerY, radius, 0, Math.PI * 2);
    this.context.stroke();

    this.context.beginPath();
    this.context.moveTo(centerX - cross, centerY);
    this.context.lineTo(centerX + cross, centerY);
    this.context.moveTo(centerX, centerY - cross);
    this.context.lineTo(centerX, centerY + cross);
    this.context.stroke();
    this.context.restore();
  }

  private getViewport(scene: ArenaScene): RenderViewport {
    const transform = this.context.getTransform();
    const scaleX = Math.max(1, Math.abs(transform.a));
    const scaleY = Math.max(1, Math.abs(transform.d));
    const canvasWidth = this.context.canvas.width / scaleX;
    const canvasHeight = this.context.canvas.height / scaleY;
    const boardWidth = scene.columns * scene.tileSize;
    const boardHeight = scene.rows * scene.tileSize;

    return {
      canvasWidth,
      canvasHeight,
      originX: Math.max(0, (canvasWidth - boardWidth) / 2),
      originY: Math.max(0, (canvasHeight - boardHeight) / 2)
    };
  }
}

interface RenderViewport {
  canvasWidth: number;
  canvasHeight: number;
  originX: number;
  originY: number;
}
