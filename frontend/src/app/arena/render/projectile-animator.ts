import { computeNormalizedProgress, interpolateLinear } from "../engine/attack-fx.helpers";
import { ArenaScene, RangedProjectileInstance } from "../engine/arena-engine.types";

export class ProjectileAnimator {
  draw(
    context: CanvasRenderingContext2D,
    scene: ArenaScene,
    originX: number,
    originY: number,
    projectile: RangedProjectileInstance
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
    const radiusPx = Math.max(4, Math.min(6, scene.tileSize * 0.12));

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
}
