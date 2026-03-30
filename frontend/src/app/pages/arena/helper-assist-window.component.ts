import { CommonModule } from "@angular/common";
import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from "@angular/core";
import {
  resolveSkillPresentation,
  type SkillVisualFamily,
  type SkillVisualTier
} from "../../shared/skills/skill-presentation.helpers";

export type AssistSkillToggleId = "exori" | "exori_min" | "exori_mas" | "avalanche";
type AssistSkillRow = Readonly<{
  skillId: AssistSkillToggleId;
  label: string;
  iconGlyph: string;
  family: SkillVisualFamily;
  tier: SkillVisualTier;
}>;

export type AssistSkillToggleChangedEvent = Readonly<{
  skillId: AssistSkillToggleId;
  enabled: boolean;
}>;

const ASSIST_SKILL_ORDER: readonly AssistSkillToggleId[] = ["exori_min", "exori", "exori_mas", "avalanche"];
const ASSIST_SKILL_ROWS: readonly AssistSkillRow[] = ASSIST_SKILL_ORDER.map((skillId) => {
  const presentation = resolveSkillPresentation({ skillId });
  return {
    skillId,
    label: presentation.label,
    iconGlyph: presentation.iconGlyph,
    family: presentation.family,
    tier: presentation.tier
  };
});

@Component({
  selector: "app-helper-assist-window",
  standalone: true,
  imports: [CommonModule],
  templateUrl: "./helper-assist-window.component.html",
  styleUrl: "./helper-assist-window.component.css",
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class HelperAssistWindowComponent {
  readonly skillRows = ASSIST_SKILL_ROWS;

  @Input() isRunStarted = false;
  @Input() assistEnabled = false;
  @Input() autoHealEnabled = false;
  @Input() healAtHpPercent = 40;
  @Input() autoGuardEnabled = false;
  @Input() guardAtHpPercent = 60;
  @Input() autoOffenseEnabled = false;
  @Input() autoSkills: Readonly<Record<AssistSkillToggleId, boolean>> = {
    exori: false,
    exori_min: false,
    exori_mas: false,
    avalanche: false
  };

  @Output() readonly assistEnabledChanged = new EventEmitter<boolean>();
  @Output() readonly autoHealEnabledChanged = new EventEmitter<boolean>();
  @Output() readonly healThresholdChanged = new EventEmitter<number>();
  @Output() readonly autoGuardEnabledChanged = new EventEmitter<boolean>();
  @Output() readonly guardThresholdChanged = new EventEmitter<number>();
  @Output() readonly autoOffenseEnabledChanged = new EventEmitter<boolean>();
  @Output() readonly autoSkillEnabledChanged = new EventEmitter<AssistSkillToggleChangedEvent>();

  onAssistEnabledChanged(event: Event): void {
    const target = event.target as HTMLInputElement | null;
    this.assistEnabledChanged.emit(target?.checked ?? this.assistEnabled);
  }

  onAutoHealEnabledChanged(event: Event): void {
    const target = event.target as HTMLInputElement | null;
    this.autoHealEnabledChanged.emit(target?.checked ?? this.autoHealEnabled);
  }

  onHealThresholdInput(event: Event): void {
    const target = event.target as HTMLInputElement | null;
    const parsed = Number(target?.value ?? Number.NaN);
    if (!Number.isFinite(parsed)) {
      return;
    }

    this.healThresholdChanged.emit(Math.round(parsed));
  }

  onAutoGuardEnabledChanged(event: Event): void {
    const target = event.target as HTMLInputElement | null;
    this.autoGuardEnabledChanged.emit(target?.checked ?? this.autoGuardEnabled);
  }

  onGuardThresholdInput(event: Event): void {
    const target = event.target as HTMLInputElement | null;
    const parsed = Number(target?.value ?? Number.NaN);
    if (!Number.isFinite(parsed)) {
      return;
    }

    this.guardThresholdChanged.emit(Math.round(parsed));
  }

  onAutoOffenseEnabledChanged(event: Event): void {
    const target = event.target as HTMLInputElement | null;
    this.autoOffenseEnabledChanged.emit(target?.checked ?? this.autoOffenseEnabled);
  }

  onAutoSkillChanged(skillId: AssistSkillToggleId, event: Event): void {
    const target = event.target as HTMLInputElement | null;
    this.autoSkillEnabledChanged.emit({
      skillId,
      enabled: target?.checked ?? this.autoSkills[skillId]
    });
  }

  trackSkillRowById(_index: number, row: AssistSkillRow): AssistSkillToggleId {
    return row.skillId;
  }
}
