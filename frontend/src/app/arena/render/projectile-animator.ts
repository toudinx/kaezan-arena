import { computeNormalizedProgress, interpolateLinear } from "../engine/attack-fx.helpers";
import { ArenaScene, RangedProjectileInstance } from "../engine/arena-engine.types";

const CHARACTER_ID_SYLWEN = "character:sylwen";
const CHARACTER_ID_VELVET = "character:velvet";

export class ProjectileAnimator {
  draw(
    context: CanvasRenderingContext2D,
    scene: ArenaScene,
    originX: number,
    originY: number,
    projectile: RangedProjectileInstance,
    options?: { projectileArrowSprite?: HTMLImageElement | null }
  ): void {
    const progress = computeNormalizedProgress(projectile.elapsedMs, Math.max(1, projectile.totalDurationMs));
    const startX = originX + (projectile.fromPos.x + 0.5) * scene.tileSize;
    const startY = originY + (projectile.fromPos.y + 0.5) * scene.tileSize;
    const endX = originX + (projectile.visualEndPos.x + 0.5) * scene.tileSize;
    const endY = originY + (projectile.visualEndPos.y + 0.5) * scene.tileSize;
    const x = interpolateLinear(startX, endX, progress);
    const y = interpolateLinear(startY, endY, progress);
    const trailProgress = Math.max(0, progress - 0.12);
    const trailX = interpolateLinear(startX, endX, trailProgress);
    const trailY = interpolateLinear(startY, endY, trailProgress);
    const angleRad = Math.atan2(endY - startY, endX - startX);
    const radiusPx = Math.max(4, Math.min(6, scene.tileSize * 0.12));
    const style = projectile.visualStyle ?? "default";

    if (style === "sylwen_whisper_shot") {
      const directionX = Math.cos(angleRad);
      const directionY = Math.sin(angleRad);
      const ghostCopies = [
        { offsetTiles: 0.3, alpha: 0.3 },
        { offsetTiles: 0.15, alpha: 0.6 }
      ];

      if (options?.projectileArrowSprite) {
        for (const ghost of ghostCopies) {
          const offsetDistance = scene.tileSize * ghost.offsetTiles;
          const ghostX = x - (directionX * offsetDistance);
          const ghostY = y - (directionY * offsetDistance);
          this.drawArrowSprite(
            context,
            scene,
            ghostX,
            ghostY,
            angleRad,
            options.projectileArrowSprite,
            0.8,
            ghost.alpha
          );
        }

        this.drawArrowSprite(context, scene, x, y, angleRad, options.projectileArrowSprite, 0.8, 1);
        return;
      }

      const arrowLength = scene.tileSize * 0.8;
      const arrowWidth = Math.max(1, scene.tileSize * (6 / 48));
      const headLength = scene.tileSize * 0.22;
      const headWidth = Math.max(1, scene.tileSize * (16 / 48));

      for (const ghost of ghostCopies) {
        const offsetDistance = scene.tileSize * ghost.offsetTiles;
        const ghostX = x - (directionX * offsetDistance);
        const ghostY = y - (directionY * offsetDistance);
        this.drawDirectionalArrow(context, ghostX, ghostY, angleRad, projectile.colorHex, ghost.alpha, {
          arrowLength,
          arrowWidth,
          headLength,
          headWidth
        });
      }

      this.drawDirectionalArrow(context, x, y, angleRad, projectile.colorHex, 1, {
        arrowLength,
        arrowWidth,
        headLength,
        headWidth
      });
      return;
    }

    if (style === "auto_attack_ranged") {
      if (this.isVelvetActiveCharacter(scene)) {
        this.drawVelvetArcaneOrb(context, scene, projectile, x, y, projectile.colorHex);
        return;
      }

      if (this.isSylwenActiveCharacter(scene) && options?.projectileArrowSprite) {
        this.drawArrowSprite(context, scene, x, y, angleRad, options.projectileArrowSprite, 0.6, 1);
        return;
      }

      const arrowLength = scene.tileSize * 0.6;
      const arrowWidth = Math.max(1, scene.tileSize * (4 / 48));
      const headLength = scene.tileSize * 0.18;
      const headWidth = Math.max(1, scene.tileSize * (10 / 48));
      this.drawDirectionalArrow(context, x, y, angleRad, projectile.colorHex, 1, {
        arrowLength,
        arrowWidth,
        headLength,
        headWidth
      });
      return;
    }

    if (style === "sylwen_gale_pierce") {
      const wakeDurationMs = 200;
      for (let sampleDelayMs = wakeDurationMs; sampleDelayMs >= 40; sampleDelayMs -= 40) {
        const sampleProgress = progress - (sampleDelayMs / Math.max(1, projectile.totalDurationMs));
        if (sampleProgress <= 0) {
          continue;
        }

        const wakeX = interpolateLinear(startX, endX, sampleProgress);
        const wakeY = interpolateLinear(startY, endY, sampleProgress);
        const wakeLife = Math.max(0, 1 - (sampleDelayMs / wakeDurationMs));
        this.drawGaleWave(context, scene, wakeX, wakeY, angleRad, projectile.colorHex, 0.4 * wakeLife);
      }

      this.drawGaleWave(context, scene, x, y, angleRad, projectile.colorHex, 1);
      return;
    }

    if (style === "velvet_umbral_path") {
      context.save();
      context.fillStyle = this.hexToRgba(projectile.colorHex, 0.6);
      context.beginPath();
      context.arc(x, y, 14, 0, Math.PI * 2);
      context.fill();
      context.strokeStyle = this.hexToRgba(projectile.colorHex, 1);
      context.lineWidth = 3;
      context.beginPath();
      context.arc(x, y, 14, 0, Math.PI * 2);
      context.stroke();
      context.restore();
      return;
    }

    if (style === "velvet_death_strike") {
      context.save();
      context.fillStyle = this.hexToRgba(projectile.colorHex, 0.5);
      context.beginPath();
      context.arc(x, y, 12, 0, Math.PI * 2);
      context.fill();

      context.strokeStyle = this.hexToRgba(projectile.colorHex, 1);
      context.lineWidth = 2;
      context.beginPath();
      context.arc(x, y, 12, 0, Math.PI * 2);
      context.stroke();
      context.restore();
      return;
    }

    context.save();
    context.lineCap = "round";
    context.strokeStyle = this.hexToRgba(projectile.colorHex, 0.6);
    context.lineWidth = Math.max(2, radiusPx * 0.8);
    context.beginPath();
    context.moveTo(trailX, trailY);
    context.lineTo(x, y);
    context.stroke();

    context.fillStyle = this.hexToRgba(projectile.colorHex, 0.98);
    context.beginPath();
    context.arc(x, y, radiusPx, 0, Math.PI * 2);
    context.fill();
    context.restore();
  }

  private drawArrowSprite(
    context: CanvasRenderingContext2D,
    scene: ArenaScene,
    centerX: number,
    centerY: number,
    travelAngle: number,
    sprite: HTMLImageElement,
    targetHeightScale: number,
    alpha: number
  ): void {
    const targetHeight = scene.tileSize * targetHeightScale;
    const scale = targetHeight / Math.max(1, sprite.height);
    const width = sprite.width * scale;
    const height = sprite.height * scale;

    context.save();
    context.globalAlpha = Math.max(0, Math.min(1, alpha));
    context.translate(centerX, centerY);
    context.rotate(travelAngle + (Math.PI / 2));
    context.drawImage(sprite, -width / 2, -height / 2, width, height);
    context.restore();
  }

  private drawVelvetArcaneOrb(
    context: CanvasRenderingContext2D,
    scene: ArenaScene,
    projectile: RangedProjectileInstance,
    centerX: number,
    centerY: number,
    colorHex: string
  ): void {
    const orbRadius = scene.tileSize * 0.12;
    const ringRadius = scene.tileSize * 0.18;
    const lineWidth = Math.max(1, scene.tileSize * (2 / 48));
    const rotationAngle = (projectile.elapsedMs / 300) * Math.PI * 2;

    context.save();
    context.fillStyle = this.hexToRgba(colorHex, 0.9);
    context.beginPath();
    context.arc(centerX, centerY, orbRadius, 0, Math.PI * 2);
    context.fill();
    context.restore();

    context.save();
    context.translate(centerX, centerY);
    context.rotate(rotationAngle);
    context.setLineDash([ringRadius * 0.8, ringRadius * 0.6]);
    context.beginPath();
    context.arc(0, 0, ringRadius, 0, Math.PI * 2);
    context.strokeStyle = this.hexToRgba(colorHex, 0.7);
    context.lineWidth = lineWidth;
    context.stroke();
    context.setLineDash([]);
    context.restore();
  }

  private drawDirectionalArrow(
    context: CanvasRenderingContext2D,
    centerX: number,
    centerY: number,
    travelAngle: number,
    colorHex: string,
    alpha: number,
    geometry: {
      arrowLength: number;
      arrowWidth: number;
      headLength: number;
      headWidth: number;
    }
  ): void {
    context.save();
    context.translate(centerX, centerY);
    context.rotate(travelAngle);

    context.beginPath();
    context.moveTo(-geometry.arrowLength / 2, 0);
    context.lineTo((geometry.arrowLength / 2) - geometry.headLength, 0);
    context.strokeStyle = this.hexToRgba(colorHex, alpha);
    context.lineWidth = geometry.arrowWidth;
    context.lineCap = "round";
    context.stroke();

    context.beginPath();
    context.moveTo(geometry.arrowLength / 2, 0);
    context.lineTo((geometry.arrowLength / 2) - geometry.headLength, -geometry.headWidth / 2);
    context.lineTo((geometry.arrowLength / 2) - geometry.headLength, geometry.headWidth / 2);
    context.closePath();
    context.fillStyle = this.hexToRgba(colorHex, alpha);
    context.fill();
    context.restore();
  }

  private drawGaleWave(
    context: CanvasRenderingContext2D,
    scene: ArenaScene,
    centerX: number,
    centerY: number,
    travelAngle: number,
    colorHex: string,
    alpha: number
  ): void {
    const waveWidth = scene.tileSize * 0.9;
    const waveDepth = scene.tileSize * 0.35;
    const waveThickness = scene.tileSize * 0.12;

    context.save();
    context.translate(centerX, centerY);
    context.rotate(travelAngle);

    context.beginPath();
    context.moveTo(-waveWidth / 2, 0);
    context.quadraticCurveTo(0, -waveDepth, waveWidth / 2, 0);
    context.strokeStyle = this.hexToRgba(colorHex, alpha);
    context.lineWidth = waveThickness;
    context.lineCap = "round";
    context.stroke();

    context.beginPath();
    context.moveTo(-(waveWidth * 0.7) / 2, scene.tileSize * 0.12);
    context.quadraticCurveTo(0, -(waveDepth * 0.6), (waveWidth * 0.7) / 2, scene.tileSize * 0.12);
    context.strokeStyle = this.hexToRgba(colorHex, alpha * 0.6);
    context.lineWidth = waveThickness * 0.5;
    context.stroke();
    context.restore();
  }

  private hexToRgba(hexColor: string, alpha: number): string {
    const normalized = hexColor.trim();
    const hex = normalized.startsWith("#") ? normalized.slice(1) : normalized;
    if (hex.length !== 6) {
      return `rgba(248, 250, 252, ${Math.max(0, Math.min(1, alpha))})`;
    }

    const r = Number.parseInt(hex.slice(0, 2), 16);
    const g = Number.parseInt(hex.slice(2, 4), 16);
    const b = Number.parseInt(hex.slice(4, 6), 16);
    if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) {
      return `rgba(248, 250, 252, ${Math.max(0, Math.min(1, alpha))})`;
    }

    return `rgba(${r}, ${g}, ${b}, ${Math.max(0, Math.min(1, alpha))})`;
  }

  private isSylwenActiveCharacter(scene: ArenaScene): boolean {
    const activeCharacterId = this.resolveActiveCharacterId(scene);
    return activeCharacterId === CHARACTER_ID_SYLWEN || activeCharacterId.includes("sylwen");
  }

  private isVelvetActiveCharacter(scene: ArenaScene): boolean {
    const activeCharacterId = this.resolveActiveCharacterId(scene);
    return activeCharacterId === CHARACTER_ID_VELVET || activeCharacterId.includes("velvet");
  }

  private resolveActiveCharacterId(scene: ArenaScene): string {
    const explicit = scene.activeCharacterId?.trim().toLowerCase();
    if (explicit) {
      return explicit;
    }

    const playerActorId = Object.values(scene.actorsById).find((actor) => actor.kind === "player")?.actorId;
    return playerActorId?.trim().toLowerCase() ?? "";
  }
}
