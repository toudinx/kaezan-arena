import { CommonModule } from "@angular/common";
import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from "@angular/core";
import type { CharacterState } from "../../api/account-api.service";
import type { ArenaBuffState, ArenaSkillState } from "../../arena/engine/arena-engine.types";
import {
  type StatusBuffViewModel,
  type StatusSkillSlotViewModel,
  buildUltimateSlotViewModel,
  mapStatusBuffs,
  mapStatusSkillSlots
} from "./status-skills.helpers";

@Component({
  selector: "app-status-skills-window",
  standalone: true,
  imports: [CommonModule],
  templateUrl: "./status-skills-window.component.html",
  styleUrl: "./status-skills-window.component.css",
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class StatusSkillsWindowComponent {
  @Input() character: CharacterState | null = null;
  @Input() hp = 0;
  @Input() maxHp = 100;
  @Input() shield = 0;
  @Input() maxShield = 80;
  @Input() skills: ReadonlyArray<ArenaSkillState> = [];
  @Input() globalCooldownRemainingMs = 0;
  @Input() globalCooldownTotalMs = 0;
  @Input() activeBuffs: ReadonlyArray<ArenaBuffState> = [];
  @Input() ultimateGauge = 0;
  @Input() ultimateGaugeMax = 100;
  @Input() ultimateReady = false;

  @Output() readonly skillActivated = new EventEmitter<string>();

  get hpPercent(): number {
    if (this.maxHp <= 0) {
      return 0;
    }

    return Math.max(0, Math.min(100, (this.hp / this.maxHp) * 100));
  }

  get shieldPercentOfMaxHp(): number {
    if (this.maxHp <= 0) {
      return 0;
    }

    const capped = Math.max(0, Math.min(this.shield, this.maxShield));
    return Math.max(0, Math.min(80, (capped / this.maxHp) * 100));
  }

  get skillSlots(): ReadonlyArray<StatusSkillSlotViewModel> {
    return [
      ...mapStatusSkillSlots(this.skills, this.globalCooldownRemainingMs, this.globalCooldownTotalMs),
      buildUltimateSlotViewModel(this.ultimateGauge, this.ultimateGaugeMax, this.ultimateReady)
    ];
  }

  get buffs(): ReadonlyArray<StatusBuffViewModel> {
    return mapStatusBuffs(this.activeBuffs);
  }

  get healingAmplifierActive(): boolean {
    return this.buffs.some((buff) => buff.isHealingAmplifier);
  }

  onSkillClick(skillId: string): void {
    this.skillActivated.emit(skillId);
  }
}
