import { ArenaScene, ElementTypeValue, RenderLayer } from "../engine/arena-engine.types";
import { resolveTierAuraFxId } from "../engine/arena-engine";
import {
  COMBAT_FX_DEATH_BURST,
  COMBAT_FX_HIT_IMPACT,
  COMBAT_FX_MELEE_SWING,
  COMBAT_FX_RANGED_PROJECTILE,
  COMBAT_FX_SKILL_CAST,
  computeNormalizedProgress,
  interpolateLinear
} from "../engine/attack-fx.helpers";
import { computeDecalFadeAlpha } from "../engine/decal.helpers";
import { PreloadedAsset } from "../assets/asset-manifest.types";
import { getMobArchetypeAccentColor } from "../engine/mob-visuals";
import { ProjectileAnimator } from "./projectile-animator";
import { computeArenaBoardOrigin } from "./arena-board-layout.helpers";
const PHYSICAL_ELEMENT: ElementTypeValue = 6;
const FLOATING_NUMBER_PALETTE = {
  damageReceivedRed: "#ef4444",
  healNeonGreen: "#39ff14",
  shieldGainBlue: "#93c5fd",
  shieldLossBlue: "#3b82f6",
  weaknessOrange: "#f97316",
  resistanceGrey: "#9ca3af",
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
  private readonly warnedTierAuraAssetIds = new Set<string>();
  private readonly missingAssetIds = new Set<string>();
  private readonly projectileAnimator = new ProjectileAnimator();
  private readonly seenPoiIds = new Set<string>();
  private readonly poiPulseExpiresAtMsById = new Map<string, number>();

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
          const actorState = scene.actorsById[actor.actorId];
          const isBoss = actorState?.kind === "boss";
          const sizeMultiplier = isBoss ? 1.5 : 0.88;
          const spriteSize = scene.tileSize * sizeMultiplier;
          const destX = viewport.originX + actor.tilePos.x * scene.tileSize + (scene.tileSize - spriteSize) / 2;
          const destY = viewport.originY + actor.tilePos.y * scene.tileSize + (scene.tileSize - spriteSize) / 2;
          if (actorState?.kind === "mob" && actorState.isElite === true) {
            this.drawEliteSpriteAura(scene, viewport, actor.tilePos.x, actor.tilePos.y);
          }
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

          await this.drawMobTierAuraGroundFx(scene, viewport, imageCache, imageLoader);
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
        this.drawMobReadabilityMarkers(scene, viewport);
        this.drawThreatTargetMarker(scene, viewport);
        this.drawLockedTargetMarker(scene, viewport);
        this.drawLowHealthDangerOverlay(scene, viewport);
        this.drawRecentHitFlashes(scene, viewport);
        this.drawMomentCues(scene, viewport);
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

  private async drawMobTierAuraGroundFx(
    scene: ArenaScene,
    viewport: RenderViewport,
    imageCache: Map<string, Promise<PreloadedAsset | null>>,
    imageLoader: (semanticId: string) => Promise<PreloadedAsset>
  ): Promise<void> {
    const ringElapsedMs = this.nowMs();
    const ringSizePx = scene.tileSize * 1.8;
    const ringOffsetX = (scene.tileSize - ringSizePx) / 2;
    const ringOffsetY = (scene.tileSize - ringSizePx) / 2;
    const sprites = scene.sprites.filter((sprite) => sprite.layer === "actors");
    console.log("[TierAura] Processing sprites:", sprites.length);
    for (const sprite of sprites) {
      const actorStateFromMap = (scene.actorsById as unknown as {
        get?: (actorId: string) => ArenaScene["actorsById"][string] | undefined;
      }).get?.(sprite.actorId);
      const actorState = actorStateFromMap ?? scene.actorsById[sprite.actorId];
      console.log("[TierAura] actorId:", sprite.actorId, "actorState:", actorState?.kind, "tierIndex:", actorState?.tierIndex);
      if (actorState?.kind !== "mob") {
        continue;
      }

      const tierAuraFxId = resolveTierAuraFxId(actorState.tierIndex ?? 1);
      if (!tierAuraFxId) {
        continue;
      }

      const loaded = await this.getAsset(imageCache, tierAuraFxId, imageLoader);
      console.log("[TierAura] fxId:", tierAuraFxId, "loaded:", !!loaded);
      if (!loaded) {
        if (!this.warnedTierAuraAssetIds.has(tierAuraFxId)) {
          this.warnedTierAuraAssetIds.add(tierAuraFxId);
          console.warn(`[TierAura] Asset not loaded: ${tierAuraFxId}`);
        }
        continue;
      }

      const centerX = viewport.originX + sprite.tilePos.x * scene.tileSize + scene.tileSize / 2;
      const centerY = viewport.originY + sprite.tilePos.y * scene.tileSize + scene.tileSize / 2;
      this.context.save();
      this.context.globalAlpha = 0.7;
      this.drawResolvedAsset(
        loaded,
        centerX - ringSizePx / 2,
        centerY - ringSizePx / 4,
        ringSizePx,
        ringSizePx,
        ringElapsedMs
      );
      this.context.restore();
    }
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

    if (attackFx.fxKind === COMBAT_FX_SKILL_CAST) {
      this.drawSkillCastFx(scene, viewport, attackFx);
      return;
    }

    if (attackFx.fxKind === COMBAT_FX_HIT_IMPACT) {
      this.drawHitImpactFx(scene, viewport, attackFx);
      return;
    }

    this.drawHitImpactFx(scene, viewport, attackFx);
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

  private drawSkillCastFx(scene: ArenaScene, viewport: RenderViewport, attackFx: ArenaScene["attackFxInstances"][number]): void {
    const progress = computeNormalizedProgress(attackFx.elapsedMs, attackFx.durationMs);
    const fromX = viewport.originX + (attackFx.fromPos.x + 0.5) * scene.tileSize;
    const fromY = viewport.originY + (attackFx.fromPos.y + 0.5) * scene.tileSize;
    const toX = viewport.originX + (attackFx.toPos.x + 0.5) * scene.tileSize;
    const toY = viewport.originY + (attackFx.toPos.y + 0.5) * scene.tileSize;
    const alpha = Math.max(0.14, 1 - progress);
    const rgb = this.getElementRgb(attackFx.element);

    this.context.save();
    this.context.strokeStyle = this.colorWithAlpha(rgb, 0.82 * alpha);
    this.context.lineWidth = Math.max(2, scene.tileSize * 0.065);
    this.context.beginPath();
    this.context.arc(fromX, fromY, scene.tileSize * (0.15 + (0.34 * progress)), 0, Math.PI * 2);
    this.context.stroke();

    this.context.strokeStyle = this.colorWithAlpha([226, 232, 240], 0.5 * alpha);
    this.context.lineWidth = Math.max(1.2, scene.tileSize * 0.03);
    this.context.beginPath();
    this.context.arc(fromX, fromY, scene.tileSize * (0.1 + (0.21 * progress)), 0, Math.PI * 2);
    this.context.stroke();

    const dx = toX - fromX;
    const dy = toY - fromY;
    const distance = Math.hypot(dx, dy);
    if (distance > 0.0001) {
      const length = Math.max(0.2, Math.min(1, progress + 0.16));
      const beamX = fromX + (dx * length);
      const beamY = fromY + (dy * length);
      this.context.strokeStyle = this.colorWithAlpha(rgb, 0.58 * alpha);
      this.context.lineCap = "round";
      this.context.lineWidth = Math.max(1.8, scene.tileSize * 0.05);
      this.context.beginPath();
      this.context.moveTo(fromX, fromY);
      this.context.lineTo(beamX, beamY);
      this.context.stroke();
    }

    this.context.restore();
  }

  private drawHitImpactFx(scene: ArenaScene, viewport: RenderViewport, attackFx: ArenaScene["attackFxInstances"][number]): void {
    const progress = computeNormalizedProgress(attackFx.elapsedMs, attackFx.durationMs);
    const centerX = viewport.originX + (attackFx.toPos.x + 0.5) * scene.tileSize;
    const centerY = viewport.originY + (attackFx.toPos.y + 0.5) * scene.tileSize;
    const rgb = this.getElementRgb(attackFx.element);
    const alpha = Math.max(0.12, 1 - progress);
    const ringRadius = scene.tileSize * (0.1 + progress * 0.27);

    this.drawImpactPulseFx(scene, viewport, attackFx);
    this.context.save();
    this.context.strokeStyle = this.colorWithAlpha(rgb, 0.8 * alpha);
    this.context.lineWidth = Math.max(1.5, scene.tileSize * 0.045);
    this.context.beginPath();
    this.context.arc(centerX, centerY, ringRadius, 0, Math.PI * 2);
    this.context.stroke();

    const spike = scene.tileSize * (0.07 + ((1 - progress) * 0.11));
    this.context.strokeStyle = this.colorWithAlpha([255, 255, 255], 0.52 * alpha);
    this.context.lineWidth = Math.max(1.2, scene.tileSize * 0.03);
    this.context.beginPath();
    this.context.moveTo(centerX - spike, centerY);
    this.context.lineTo(centerX + spike, centerY);
    this.context.moveTo(centerX, centerY - spike);
    this.context.lineTo(centerX, centerY + spike);
    this.context.stroke();
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

    this.context.lineWidth = Math.max(1.5, scene.tileSize * 0.05);
    this.context.strokeStyle = this.colorWithAlpha([255, 237, 213], alpha * 0.8);
    this.context.beginPath();
    this.context.arc(centerX, centerY, radius * 0.62, 0, Math.PI * 2);
    this.context.stroke();

    const shards = 6;
    const shardLength = scene.tileSize * (0.12 + (0.24 * progress));
    for (let i = 0; i < shards; i += 1) {
      const angle = (Math.PI * 2 * i) / shards + (progress * Math.PI * 0.45);
      const inner = radius * 0.35;
      const x1 = centerX + (Math.cos(angle) * inner);
      const y1 = centerY + (Math.sin(angle) * inner);
      const x2 = centerX + (Math.cos(angle) * (inner + shardLength));
      const y2 = centerY + (Math.sin(angle) * (inner + shardLength));
      this.context.beginPath();
      this.context.moveTo(x1, y1);
      this.context.lineTo(x2, y2);
      this.context.stroke();
    }
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
      const explicitRow = typeof resolved.row === "number" && Number.isFinite(resolved.row)
        ? Math.floor(resolved.row)
        : null;
      const rowIndex = explicitRow === null
        ? Math.min(rowCount, Math.max(1, element))
        : Math.max(1, Math.min(rowCount, explicitRow + 1));
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

  private drawEliteSpriteAura(scene: ArenaScene, viewport: RenderViewport, tileX: number, tileY: number): void {
    const centerX = viewport.originX + (tileX + 0.5) * scene.tileSize;
    const centerY = viewport.originY + (tileY + 0.5) * scene.tileSize;
    const pulseNowMs = typeof performance !== "undefined" ? performance.now() : Date.now();
    const pulse = 0.78 + (0.22 * Math.sin(pulseNowMs / 210));
    const outerRadius = scene.tileSize * (0.42 + ((1 - pulse) * 0.08));
    const innerRadius = scene.tileSize * 0.3;

    this.context.save();
    this.context.fillStyle = `rgba(245, 158, 11, ${0.11 * pulse})`;
    this.context.beginPath();
    this.context.arc(centerX, centerY, outerRadius, 0, Math.PI * 2);
    this.context.fill();

    this.context.fillStyle = "rgba(251, 191, 36, 0.09)";
    this.context.beginPath();
    this.context.arc(centerX, centerY, innerRadius, 0, Math.PI * 2);
    this.context.fill();
    this.context.restore();
  }

  private drawMobHpBars(scene: ArenaScene, viewport: RenderViewport): void {
    const mobs = Object.values(scene.actorsById).filter((actor) => actor.kind === "mob");
    for (const mob of mobs) {
      const ratio = mob.maxHp > 0 ? Math.max(0, Math.min(1, mob.hp / mob.maxHp)) : 0;
      const isElite = mob.isElite === true;
      const barWidth = scene.tileSize * (isElite ? 0.84 : 0.76);
      const barHeight = Math.max(isElite ? 5 : 4, scene.tileSize * (isElite ? 0.112 : 0.092));
      const originX = viewport.originX + mob.tileX * scene.tileSize + (scene.tileSize - barWidth) / 2;
      const originY = viewport.originY + mob.tileY * scene.tileSize - barHeight - (isElite ? 8 : 5);

      this.context.save();
      this.context.fillStyle = isElite ? "rgba(30, 19, 7, 0.92)" : "rgba(15, 23, 42, 0.82)";
      this.context.fillRect(originX, originY, barWidth, barHeight);
      this.context.strokeStyle = isElite ? "rgba(245, 158, 11, 0.96)" : getMobArchetypeAccentColor(mob.mobType);
      this.context.lineWidth = isElite ? 1.4 : 1;
      this.context.strokeRect(originX - 0.5, originY - 0.5, barWidth + 1, barHeight + 1);

      this.context.fillStyle = isElite
        ? (ratio > 0.45 ? "#fbbf24" : ratio > 0.22 ? "#fb923c" : "#f87171")
        : (ratio > 0.4 ? "#22c55e" : ratio > 0.2 ? "#f59e0b" : "#ef4444");
      this.context.fillRect(originX + 1, originY + 1, (barWidth - 2) * ratio, barHeight - 2);

      if (isElite) {
        const badgeWidth = Math.max(18, barWidth * 0.5);
        const badgeHeight = Math.max(8, scene.tileSize * 0.18);
        const badgeX = originX + (barWidth - badgeWidth) / 2;
        const badgeY = originY - badgeHeight - 3;
        this.context.fillStyle = "rgba(120, 53, 15, 0.94)";
        this.context.fillRect(badgeX, badgeY, badgeWidth, badgeHeight);
        this.context.strokeStyle = "rgba(251, 191, 36, 0.94)";
        this.context.lineWidth = Math.max(1, scene.tileSize * 0.025);
        this.context.strokeRect(badgeX, badgeY, badgeWidth, badgeHeight);
        this.context.fillStyle = "rgba(255, 237, 213, 0.98)";
        this.context.textAlign = "center";
        this.context.textBaseline = "middle";
        this.context.font = `bold ${Math.max(7, Math.floor(scene.tileSize * 0.14))}px monospace`;
        this.context.fillText("ELITE", badgeX + badgeWidth / 2, badgeY + badgeHeight / 2 + 0.5);
      }

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
      if (entry.kind !== "crit_text" && entry.kind !== "combat_callout") {
        continue;
      }

      const life = Math.max(0, Math.min(1, entry.elapsedMs / entry.durationMs));
      let riseOffset = life * scene.tileSize * 0.45;
      const x = viewport.originX + (entry.tilePos.x + 0.5) * scene.tileSize;
      let baseY = entry.kind === "combat_callout"
        ? viewport.originY + entry.tilePos.y * scene.tileSize - scene.tileSize * 0.28
        : viewport.originY + entry.tilePos.y * scene.tileSize - scene.tileSize * 0.12;
      let toneScale = 1;
      if (entry.kind === "combat_callout") {
        if (entry.tone === "shield_break") {
          toneScale = 1.12;
          riseOffset *= 0.86;
        } else if (entry.tone === "danger") {
          toneScale = 1.08;
        } else if (entry.tone === "elite") {
          toneScale = 1.05;
          baseY -= scene.tileSize * 0.02;
        } else if (entry.tone === "reward") {
          toneScale = 1.06;
          baseY -= scene.tileSize * 0.018;
        }
      }
      const y = baseY - riseOffset;
      const baseFontPx = entry.kind === "combat_callout"
        ? Math.max(13, Math.min(19, scene.tileSize * 0.34))
        : Math.max(16, Math.min(24, scene.tileSize * 0.42));
      const entryScale = Math.max(0.6, entry.fontScale ?? 1);
      const fontSizePx = Math.round(baseFontPx * entryScale * toneScale * (1 + (1 - life) * 0.08));
      const palette = this.resolveFloatingTextPalette(entry);

      this.context.save();
      this.context.globalAlpha = Math.max(0.1, 1 - life);
      this.context.textAlign = "center";
      this.context.textBaseline = "middle";
      this.context.font = `bold ${fontSizePx}px Arial`;
      this.context.fillStyle = palette.fill;
      this.context.strokeStyle = palette.outline;
      this.context.lineWidth = Math.max(2, Math.round(fontSizePx * 0.18));
      this.context.lineJoin = "round";
      this.context.strokeText(entry.text, x, y);
      this.context.fillText(entry.text, x, y);
      this.context.restore();
    }
  }

  private drawRecentHitFlashes(scene: ArenaScene, viewport: RenderViewport): void {
    if (scene.damageNumbers.length === 0) {
      return;
    }

    let drawn = 0;
    for (const entry of scene.damageNumbers) {
      if (drawn >= 22) {
        break;
      }

      if (entry.kind !== "damage" || entry.isHeal) {
        continue;
      }

      const life = Math.max(0, Math.min(1, entry.elapsedMs / entry.durationMs));
      if (life > 0.24) {
        continue;
      }

      const centerX = viewport.originX + (entry.tilePos.x + 0.5) * scene.tileSize;
      const centerY = viewport.originY + (entry.tilePos.y + 0.5) * scene.tileSize;
      const flashScale = 1 - (life / 0.24);
      const radius = scene.tileSize * (0.2 + ((1 - flashScale) * 0.08));
      const alpha = Math.max(0.08, flashScale * (entry.isCrit ? 0.34 : 0.2));
      const rgb = this.getElementRgb(entry.element);

      this.context.save();
      this.context.fillStyle = this.colorWithAlpha(rgb, alpha * 0.42);
      this.context.beginPath();
      this.context.arc(centerX, centerY, radius, 0, Math.PI * 2);
      this.context.fill();

      this.context.strokeStyle = this.colorWithAlpha(rgb, alpha);
      this.context.lineWidth = Math.max(1.2, scene.tileSize * 0.03);
      this.context.beginPath();
      this.context.arc(centerX, centerY, radius * 1.15, 0, Math.PI * 2);
      this.context.stroke();
      this.context.restore();

      drawn += 1;
    }
  }

  private resolveFloatingTextPalette(entry: ArenaScene["floatingTexts"][number]): { fill: string; outline: string } {
    if (entry.kind !== "combat_callout") {
      return CRIT_TEXT_PALETTE;
    }

    if (entry.tone === "elite") {
      return { fill: "#fbbf24", outline: "rgba(69, 26, 3, 0.96)" };
    }

    if (entry.tone === "assist") {
      return { fill: "#67e8f9", outline: "rgba(12, 74, 110, 0.95)" };
    }

    if (entry.tone === "shield_break") {
      return { fill: "#dbeafe", outline: "rgba(30, 64, 175, 0.96)" };
    }

    if (entry.tone === "danger") {
      return { fill: "#fca5a5", outline: "rgba(69, 10, 10, 0.96)" };
    }

    if (entry.tone === "reward") {
      return { fill: "#fde68a", outline: "rgba(120, 53, 15, 0.95)" };
    }

    return CRIT_TEXT_PALETTE;
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

    if (entry.isWeaknessHit) {
      return FLOATING_NUMBER_PALETTE.weaknessOrange;
    }

    if (entry.isResistanceHit) {
      return FLOATING_NUMBER_PALETTE.resistanceGrey;
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

    if (entry.isWeaknessHit) {
      return `▲${entry.amount}`;
    }

    if (entry.isResistanceHit) {
      return `▼${entry.amount}`;
    }

    return `${entry.amount}`;
  }

  private drawPoiMarkers(scene: ArenaScene, viewport: RenderViewport): void {
    if (scene.activePois.length === 0) {
      this.seenPoiIds.clear();
      this.poiPulseExpiresAtMsById.clear();
      return;
    }

    this.syncPoiPulseState(scene);
    const nowMs = this.nowMs();
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
        const isSpeciesChest = poi.type === "species_chest";
        this.drawChestAmbientAura(scene.tileSize, centerX, centerY, poi.poiId, nowMs, isSpeciesChest);
        this.drawChestPoiMarker(scene.tileSize, centerX, centerY, isSpeciesChest, poi.poiId, nowMs);
      } else if (poi.type === "mimic_dormant") {
        // Dormant mimic looks like a chest but has a subtle red tint on the aura
        this.drawChestAmbientAura(scene.tileSize, centerX, centerY, poi.poiId, nowMs, false);
        this.drawChestPoiMarker(scene.tileSize, centerX, centerY, false, poi.poiId, nowMs);
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

      const pulseUntilMs = this.poiPulseExpiresAtMsById.get(poi.poiId) ?? 0;
      if (pulseUntilMs > nowMs) {
        const life = Math.max(0, Math.min(1, (pulseUntilMs - nowMs) / 1100));
        const pulseRadius = scene.tileSize * (0.34 + ((1 - life) * 0.34));
        const pulseAlpha = Math.max(0.06, life * 0.32);
        const pulseColor = poi.type === "species_chest"
          ? `rgba(125, 211, 252, ${pulseAlpha})`
          : poi.type === "chest"
            ? `rgba(251, 191, 36, ${pulseAlpha})`
            : poi.type === "mimic_dormant"
              ? `rgba(251, 191, 36, ${pulseAlpha})`
              : `rgba(103, 232, 249, ${pulseAlpha * 0.9})`;
        this.context.strokeStyle = pulseColor;
        this.context.lineWidth = Math.max(1.8, scene.tileSize * 0.045);
        this.context.beginPath();
        this.context.arc(centerX, centerY, pulseRadius, 0, Math.PI * 2);
        this.context.stroke();
      }
      this.context.restore();
    }
  }

  private syncPoiPulseState(scene: ArenaScene): void {
    const nowMs = this.nowMs();
    const activePoiIds = new Set<string>();
    for (const poi of scene.activePois) {
      activePoiIds.add(poi.poiId);
      if (this.seenPoiIds.has(poi.poiId)) {
        continue;
      }

      this.seenPoiIds.add(poi.poiId);
      const pulseDurationMs = poi.type === "species_chest"
        ? 1600
        : poi.type === "chest" || poi.type === "mimic_dormant"
          ? 1300
          : 900;
      this.poiPulseExpiresAtMsById.set(poi.poiId, nowMs + pulseDurationMs);
    }

    for (const knownPoiId of [...this.seenPoiIds]) {
      if (activePoiIds.has(knownPoiId)) {
        continue;
      }

      this.seenPoiIds.delete(knownPoiId);
      this.poiPulseExpiresAtMsById.delete(knownPoiId);
    }

    for (const [poiId, expireAtMs] of this.poiPulseExpiresAtMsById.entries()) {
      if (expireAtMs > nowMs) {
        continue;
      }

      this.poiPulseExpiresAtMsById.delete(poiId);
    }
  }

  private nowMs(): number {
    return typeof performance !== "undefined" ? performance.now() : Date.now();
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

  private drawChestAmbientAura(
    tileSize: number,
    centerX: number,
    centerY: number,
    poiId: string,
    nowMs: number,
    isSpeciesChest: boolean
  ): void {
    const phase = ((nowMs * 0.007) + this.computeStablePoiPhaseSeed(poiId)) % (Math.PI * 2);
    const pulse = 0.5 + (Math.sin(phase) * 0.5);
    const auraRadius = tileSize * (0.3 + (pulse * 0.05));
    const auraAlpha = (isSpeciesChest ? 0.14 : 0.18) + (pulse * 0.1);
    const auraColor = isSpeciesChest
      ? `rgba(147, 197, 253, ${Math.min(0.32, auraAlpha)})`
      : `rgba(251, 191, 36, ${Math.min(0.38, auraAlpha)})`;
    this.context.fillStyle = auraColor;
    this.context.beginPath();
    this.context.arc(centerX, centerY, auraRadius, 0, Math.PI * 2);
    this.context.fill();

    const orbitRadius = tileSize * (0.44 + (pulse * 0.03));
    const orbitAlpha = 0.24 + (pulse * 0.22);
    this.context.strokeStyle = isSpeciesChest
      ? `rgba(191, 219, 254, ${Math.min(0.46, orbitAlpha)})`
      : `rgba(253, 230, 138, ${Math.min(0.52, orbitAlpha)})`;
    this.context.lineWidth = Math.max(1.2, tileSize * 0.032);
    this.context.beginPath();
    this.context.arc(centerX, centerY, orbitRadius, 0, Math.PI * 2);
    this.context.stroke();
  }

  private drawChestPoiMarker(
    tileSize: number,
    centerX: number,
    centerY: number,
    isSpeciesChest: boolean,
    poiId: string,
    nowMs: number
  ): void {
    const width = tileSize * 0.52;
    const height = tileSize * 0.34;
    const phase = ((nowMs * 0.008) + this.computeStablePoiPhaseSeed(poiId) + Math.PI * 0.35) % (Math.PI * 2);
    const bobOffsetY = Math.sin(phase) * tileSize * 0.012;
    const x = centerX - width / 2;
    const y = centerY - height / 2 + bobOffsetY;

    this.context.fillStyle = isSpeciesChest ? "rgba(30, 64, 175, 0.9)" : "rgba(120, 53, 15, 0.92)";
    this.context.fillRect(x, y, width, height);
    this.context.strokeStyle = isSpeciesChest ? "rgba(147, 197, 253, 0.95)" : "rgba(245, 158, 11, 0.95)";
    this.context.lineWidth = Math.max(1.5, tileSize * 0.04);
    this.context.strokeRect(x, y, width, height);

    this.context.fillStyle = isSpeciesChest ? "rgba(219, 234, 254, 0.95)" : "rgba(251, 191, 36, 0.95)";
    this.context.fillRect(centerX - tileSize * 0.035, y + height * 0.24, tileSize * 0.07, height * 0.52);
    this.context.strokeStyle = isSpeciesChest ? "rgba(191, 219, 254, 0.7)" : "rgba(253, 230, 138, 0.78)";
    this.context.lineWidth = Math.max(1.1, tileSize * 0.028);
    this.context.beginPath();
    this.context.moveTo(x + tileSize * 0.04, y + height * 0.16);
    this.context.lineTo(x + width - tileSize * 0.04, y + height * 0.16);
    this.context.stroke();

    if (isSpeciesChest) {
      this.context.fillStyle = "rgba(15, 23, 42, 0.95)";
      this.context.font = `${Math.max(9, Math.floor(tileSize * 0.2))}px monospace`;
      this.context.textAlign = "center";
      this.context.textBaseline = "middle";
      this.context.fillText("S", centerX, y + height * 0.2);
    }
  }

  private computeStablePoiPhaseSeed(poiId: string): number {
    let hash = 0;
    for (let index = 0; index < poiId.length; index += 1) {
      hash = ((hash * 31) + poiId.charCodeAt(index)) >>> 0;
    }

    return (hash % 628) / 100;
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
        const targetGuideColor = effectiveTarget.isElite === true
          ? "rgba(251, 191, 36, 0.72)"
          : "rgba(248, 113, 113, 0.65)";
        this.drawDirectionalGuide(playerCenterX, playerCenterY, targetCenterX, targetCenterY, targetGuideColor);
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

    const isElite = effectiveTarget.isElite === true;
    const centerX = viewport.originX + (effectiveTarget.tileX + 0.5) * scene.tileSize;
    const centerY = viewport.originY + (effectiveTarget.tileY + 0.5) * scene.tileSize;
    const pulseNowMs = typeof performance !== "undefined" ? performance.now() : Date.now();
    const pulse = 0.84 + (0.16 * Math.sin(pulseNowMs / 190));
    const radius = scene.tileSize * (isElite ? 0.5 : 0.48);
    const markerSize = scene.tileSize * (isElite ? 0.18 : 0.16);

    this.context.save();
    this.context.fillStyle = isElite ? "rgba(248, 113, 113, 0.2)" : "rgba(248, 113, 113, 0.18)";
    this.context.beginPath();
    this.context.arc(centerX, centerY, radius, 0, Math.PI * 2);
    this.context.fill();

    this.context.strokeStyle = "rgba(248, 113, 113, 0.95)";
    this.context.lineWidth = Math.max(2.5, scene.tileSize * (isElite ? 0.065 : 0.06));
    this.context.beginPath();
    this.context.arc(centerX, centerY, radius, 0, Math.PI * 2);
    this.context.stroke();

    if (isElite) {
      this.context.strokeStyle = `rgba(251, 191, 36, ${Math.max(0.55, pulse)})`;
      this.context.lineWidth = Math.max(1.5, scene.tileSize * 0.038);
      this.context.beginPath();
      this.context.arc(centerX, centerY, radius * (1.09 + ((1 - pulse) * 0.08)), 0, Math.PI * 2);
      this.context.stroke();
    }

    this.context.fillStyle = "rgba(248, 113, 113, 0.95)";
    this.context.beginPath();
    this.context.moveTo(centerX, centerY - radius - markerSize);
    this.context.lineTo(centerX - markerSize * 0.72, centerY - radius - markerSize * 2);
    this.context.lineTo(centerX + markerSize * 0.72, centerY - radius - markerSize * 2);
    this.context.closePath();
    this.context.fill();

    if (isElite) {
      const eliteBadgeY = centerY - radius - markerSize * 2.35;
      this.context.fillStyle = "rgba(251, 191, 36, 0.96)";
      this.context.beginPath();
      this.context.arc(centerX, eliteBadgeY, Math.max(2, scene.tileSize * 0.075), 0, Math.PI * 2);
      this.context.fill();
    }
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
      const isHovered = scene.hoveredMobEntityId === mob.actorId;
      const isLocked = scene.effectiveTargetEntityId === mob.actorId || scene.lockedTargetEntityId === mob.actorId;
      const isThreat = scene.threatMobEntityId === mob.actorId;

      if (mob.isElite === true) {
        this.drawEliteMarker(scene.tileSize, centerX, centerY, isLocked || isHovered, isThreat);
        continue;
      }

      if (isHovered && !isLocked) {
        this.drawHoveredMobMarker(scene.tileSize, centerX, centerY);
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

  private drawEliteMarker(
    tileSize: number,
    centerX: number,
    centerY: number,
    isFocused: boolean,
    isThreat: boolean
  ): void {
    const radius = tileSize * 0.46;
    const iconRadius = tileSize * 0.09;
    const iconCenterY = centerY - radius - tileSize * 0.12;
    const pulseNowMs = typeof performance !== "undefined" ? performance.now() : Date.now();
    const pulse = 0.86 + (0.14 * Math.sin(pulseNowMs / 220));

    this.context.save();
    this.context.fillStyle = "rgba(245, 158, 11, 0.18)";
    this.context.beginPath();
    this.context.arc(centerX, centerY, radius, 0, Math.PI * 2);
    this.context.fill();

    this.context.strokeStyle = "rgba(245, 158, 11, 0.95)";
    this.context.lineWidth = Math.max(2.2, tileSize * 0.055);
    this.context.beginPath();
    this.context.arc(centerX, centerY, radius, 0, Math.PI * 2);
    this.context.stroke();

    this.context.strokeStyle = `rgba(254, 215, 170, ${Math.max(0.2, pulse)})`;
    this.context.lineWidth = Math.max(1.2, tileSize * 0.03);
    this.context.beginPath();
    this.context.arc(centerX, centerY, radius * (1.08 + ((1 - pulse) * 0.16)), 0, Math.PI * 2);
    this.context.stroke();

    if (isFocused) {
      this.context.strokeStyle = "rgba(254, 240, 138, 0.92)";
      this.context.lineWidth = Math.max(1.8, tileSize * 0.04);
      this.context.beginPath();
      this.context.arc(centerX, centerY, radius * 1.2, 0, Math.PI * 2);
      this.context.stroke();
    }

    if (isThreat) {
      this.context.fillStyle = "rgba(248, 113, 113, 0.9)";
      this.context.beginPath();
      this.context.arc(centerX + radius * 0.68, centerY - radius * 0.68, Math.max(2, tileSize * 0.07), 0, Math.PI * 2);
      this.context.fill();
    }

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

  private drawHoveredMobMarker(tileSize: number, centerX: number, centerY: number): void {
    const radius = tileSize * 0.39;
    this.context.save();
    this.context.strokeStyle = "rgba(125, 211, 252, 0.72)";
    this.context.lineWidth = Math.max(1.3, tileSize * 0.03);
    this.context.beginPath();
    this.context.arc(centerX, centerY, radius, 0, Math.PI * 2);
    this.context.stroke();
    this.context.restore();
  }

  private drawEliteBuffedMarker(tileSize: number, centerX: number, centerY: number): void {
    const ringRadius = tileSize * 0.42;
    const dotRadius = tileSize * 0.08;

    this.context.save();
    this.context.strokeStyle = "rgba(250, 204, 21, 0.6)";
    this.context.lineWidth = Math.max(1.5, tileSize * 0.04);
    this.context.beginPath();
    this.context.arc(centerX, centerY, ringRadius, 0, Math.PI * 2);
    this.context.stroke();

    this.context.fillStyle = "rgba(250, 204, 21, 0.88)";
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

    const isEliteThreat = threatMob.isElite === true;
    const centerX = viewport.originX + (threatMob.tileX + 0.5) * scene.tileSize;
    const centerY = viewport.originY + (threatMob.tileY + 0.5) * scene.tileSize;
    const markerY = centerY - scene.tileSize * (isEliteThreat ? 0.48 : 0.45);
    const radius = scene.tileSize * (isEliteThreat ? 0.12 : 0.1);

    this.context.save();
    this.context.strokeStyle = isEliteThreat ? "rgba(251, 191, 36, 0.95)" : "rgba(248, 113, 113, 0.92)";
    this.context.lineWidth = Math.max(1.5, scene.tileSize * (isEliteThreat ? 0.045 : 0.04));
    this.context.beginPath();
    this.context.arc(centerX, markerY, radius * (isEliteThreat ? 1.5 : 1.35), 0, Math.PI * 2);
    this.context.stroke();

    this.context.fillStyle = isEliteThreat ? "rgba(251, 146, 60, 0.92)" : "rgba(248, 113, 113, 0.92)";
    this.context.beginPath();
    this.context.arc(centerX, markerY, radius, 0, Math.PI * 2);
    this.context.fill();

    if (isEliteThreat) {
      this.context.fillStyle = "rgba(255, 237, 213, 0.95)";
      this.context.beginPath();
      this.context.arc(centerX, markerY, radius * 0.42, 0, Math.PI * 2);
      this.context.fill();
    }
    this.context.restore();
  }

  private drawLowHealthDangerOverlay(scene: ArenaScene, viewport: RenderViewport): void {
    const player = Object.values(scene.actorsById).find((actor) => actor.kind === "player");
    if (!player || player.maxHp <= 0) {
      return;
    }

    const hpRatio = Math.max(0, Math.min(1, player.hp / Math.max(1, player.maxHp)));
    const shield = Math.max(0, player.shield ?? 0);
    const maxShield = Math.max(0, player.maxShield ?? 0);
    const effectiveRatio = maxShield > 0
      ? Math.max(0, Math.min(1, (player.hp + shield) / Math.max(1, player.maxHp + maxShield)))
      : hpRatio;
    if (hpRatio > 0.42 && effectiveRatio > 0.5) {
      return;
    }

    const severityFromHp = Math.max(0, Math.min(1, (0.42 - hpRatio) / 0.42));
    const severityFromEffective = Math.max(0, Math.min(1, (0.5 - effectiveRatio) / 0.5));
    const severity = Math.max(severityFromHp, severityFromEffective * 0.8);
    if (severity <= 0) {
      return;
    }

    const pulseNowMs = typeof performance !== "undefined" ? performance.now() : Date.now();
    const pulse = 0.76 + (0.24 * Math.sin(pulseNowMs / 150));
    const alpha = Math.max(0.06, Math.min(0.32, (0.08 + (severity * 0.22)) * pulse));
    const centerX = viewport.originX + (scene.columns * scene.tileSize) / 2;
    const centerY = viewport.originY + (scene.rows * scene.tileSize) / 2;
    const radius = Math.max(scene.columns, scene.rows) * scene.tileSize * 0.72;
    const boardWidth = scene.columns * scene.tileSize;
    const boardHeight = scene.rows * scene.tileSize;
    const vignette = this.context.createRadialGradient(centerX, centerY, radius * 0.42, centerX, centerY, radius);
    vignette.addColorStop(0, "rgba(127, 29, 29, 0)");
    vignette.addColorStop(1, `rgba(127, 29, 29, ${alpha})`);

    this.context.save();
    this.context.fillStyle = vignette;
    this.context.fillRect(viewport.originX, viewport.originY, boardWidth, boardHeight);

    const playerCenterX = viewport.originX + (player.tileX + 0.5) * scene.tileSize;
    const playerCenterY = viewport.originY + (player.tileY + 0.5) * scene.tileSize;
    const heartbeatRadius = scene.tileSize * (0.3 + ((1 - pulse) * 0.1));
    this.context.strokeStyle = `rgba(248, 113, 113, ${Math.max(0.12, alpha * 1.5)})`;
    this.context.lineWidth = Math.max(1.6, scene.tileSize * 0.04);
    this.context.beginPath();
    this.context.arc(playerCenterX, playerCenterY, heartbeatRadius, 0, Math.PI * 2);
    this.context.stroke();

    this.context.strokeStyle = `rgba(127, 29, 29, ${Math.max(0.08, alpha * 1.1)})`;
    this.context.lineWidth = Math.max(1.1, scene.tileSize * 0.028);
    this.context.beginPath();
    this.context.arc(playerCenterX, playerCenterY, heartbeatRadius * 1.23, 0, Math.PI * 2);
    this.context.stroke();
    this.context.restore();
  }

  private drawMomentCues(scene: ArenaScene, viewport: RenderViewport): void {
    const cues = scene.momentCues ?? [];
    if (cues.length === 0) {
      return;
    }

    for (const cue of cues) {
      const life = Math.max(0, Math.min(1, cue.elapsedMs / cue.durationMs));
      const centerX = viewport.originX + (cue.tilePos.x + 0.5) * scene.tileSize;
      const centerY = viewport.originY + (cue.tilePos.y + 0.5) * scene.tileSize;
      const startRadius = scene.tileSize * 0.12;
      let endRadius = scene.tileSize * 0.62;
      let strokeColor = "rgba(226, 232, 240, 0.8)";
      let fillColor = "rgba(148, 163, 184, 0.14)";
      let lineWidth = Math.max(2, scene.tileSize * 0.06);

      if (cue.kind === "elite_spawn") {
        endRadius = scene.tileSize * 0.76;
        strokeColor = "rgba(251, 191, 36, 0.92)";
        fillColor = "rgba(245, 158, 11, 0.2)";
      } else if (cue.kind === "elite_died") {
        endRadius = scene.tileSize * 0.68;
        strokeColor = "rgba(45, 212, 191, 0.88)";
        fillColor = "rgba(20, 184, 166, 0.18)";
      } else if (cue.kind === "mob_death") {
        endRadius = scene.tileSize * 0.52;
        strokeColor = "rgba(251, 146, 60, 0.76)";
        fillColor = "rgba(124, 45, 18, 0.14)";
        lineWidth = Math.max(1.5, scene.tileSize * 0.045);
      } else if (cue.kind === "shield_break") {
        endRadius = scene.tileSize * 0.7;
        strokeColor = "rgba(191, 219, 254, 0.95)";
        fillColor = "rgba(96, 165, 250, 0.2)";
        lineWidth = Math.max(2.2, scene.tileSize * 0.07);
      } else if (cue.kind === "assist_cast") {
        endRadius = scene.tileSize * 0.56;
        strokeColor = "rgba(56, 189, 248, 0.9)";
        fillColor = "rgba(14, 165, 233, 0.16)";
      } else if (cue.kind === "danger_hit") {
        endRadius = scene.tileSize * 0.6;
        strokeColor = "rgba(248, 113, 113, 0.9)";
        fillColor = "rgba(239, 68, 68, 0.16)";
      } else if (cue.kind === "player_death") {
        endRadius = scene.tileSize * 1.05;
        strokeColor = "rgba(248, 113, 113, 0.95)";
        fillColor = "rgba(127, 29, 29, 0.24)";
        lineWidth = Math.max(2.8, scene.tileSize * 0.085);
      } else if (cue.kind === "reward_open") {
        endRadius = scene.tileSize * 0.72;
        strokeColor = "rgba(253, 230, 138, 0.9)";
        fillColor = "rgba(245, 158, 11, 0.18)";
        lineWidth = Math.max(2.2, scene.tileSize * 0.065);
      }

      const radius = interpolateLinear(startRadius, endRadius, life);
      const alpha = Math.max(0.06, 1 - life);
      this.context.save();
      this.context.globalAlpha = alpha;
      this.context.fillStyle = fillColor;
      this.context.beginPath();
      this.context.arc(centerX, centerY, radius * 0.82, 0, Math.PI * 2);
      this.context.fill();

      this.context.strokeStyle = strokeColor;
      this.context.lineWidth = lineWidth;
      this.context.beginPath();
      this.context.arc(centerX, centerY, radius, 0, Math.PI * 2);
      this.context.stroke();

      if (cue.kind === "player_death") {
        const cross = scene.tileSize * (0.18 + (0.14 * (1 - life)));
        this.context.beginPath();
        this.context.moveTo(centerX - cross, centerY - cross);
        this.context.lineTo(centerX + cross, centerY + cross);
        this.context.moveTo(centerX + cross, centerY - cross);
        this.context.lineTo(centerX - cross, centerY + cross);
        this.context.stroke();
      } else if (cue.kind === "shield_break") {
        const shardLength = scene.tileSize * (0.11 + ((1 - life) * 0.1));
        this.context.lineWidth = Math.max(1.2, scene.tileSize * 0.03);
        for (let index = 0; index < 5; index += 1) {
          const angle = (Math.PI * 2 * index) / 5 + (life * Math.PI * 0.6);
          this.context.beginPath();
          this.context.moveTo(centerX + (Math.cos(angle) * shardLength * 0.45), centerY + (Math.sin(angle) * shardLength * 0.45));
          this.context.lineTo(centerX + (Math.cos(angle) * shardLength), centerY + (Math.sin(angle) * shardLength));
          this.context.stroke();
        }
      } else if (cue.kind === "assist_cast") {
        const spoke = scene.tileSize * (0.1 + ((1 - life) * 0.1));
        this.context.lineWidth = Math.max(1.1, scene.tileSize * 0.03);
        for (let index = 0; index < 4; index += 1) {
          const angle = (Math.PI * 2 * index) / 4 + (Math.PI / 4);
          this.context.beginPath();
          this.context.moveTo(centerX, centerY);
          this.context.lineTo(centerX + (Math.cos(angle) * spoke), centerY + (Math.sin(angle) * spoke));
          this.context.stroke();
        }
      } else if (cue.kind === "reward_open") {
        const sparkle = scene.tileSize * (0.1 + ((1 - life) * 0.08));
        this.context.lineWidth = Math.max(1.15, scene.tileSize * 0.03);
        for (let index = 0; index < 4; index += 1) {
          const angle = (Math.PI * 2 * index) / 4;
          this.context.beginPath();
          this.context.moveTo(
            centerX + (Math.cos(angle) * sparkle * 0.38),
            centerY + (Math.sin(angle) * sparkle * 0.38)
          );
          this.context.lineTo(
            centerX + (Math.cos(angle) * sparkle),
            centerY + (Math.sin(angle) * sparkle)
          );
          this.context.stroke();
        }
      }

      this.context.restore();
    }
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
    const origin = computeArenaBoardOrigin({
      columns: scene.columns,
      rows: scene.rows,
      tileSize: scene.tileSize,
      canvasWidth,
      canvasHeight
    });

    return {
      canvasWidth,
      canvasHeight,
      originX: origin.x,
      originY: origin.y
    };
  }
}

interface RenderViewport {
  canvasWidth: number;
  canvasHeight: number;
  originX: number;
  originY: number;
}
