import { CommonModule } from "@angular/common";
import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from "@angular/core";

export type ManualKitSkillRow = Readonly<{
  hotkey: "Q" | "W" | "E" | "R";
  skillId: string;
  displayName: string;
  cooldownRemainingMs: number;
  cooldownTotalMs: number;
  cooldownRemainingFraction: number;
  cooldownRemainingPercent: number;
  cooldownRemainingLabel: string;
  isReady: boolean;
}>;

@Component({
  selector: "app-helper-assist-window",
  standalone: true,
  imports: [CommonModule],
  templateUrl: "./helper-assist-window.component.html",
  styleUrl: "./helper-assist-window.component.css",
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class HelperAssistWindowComponent {
  @Input() isRunStarted = false;
  @Input() assistEnabled = false;
  @Input() manualSkillRows: ReadonlyArray<ManualKitSkillRow> = [];

  @Output() readonly assistEnabledChanged = new EventEmitter<boolean>();

  onAssistEnabledChanged(event: Event): void {
    const target = event.target as HTMLInputElement | null;
    this.assistEnabledChanged.emit(target?.checked ?? this.assistEnabled);
  }

  trackManualSkillRowByHotkey(_index: number, row: ManualKitSkillRow): string {
    return row.hotkey;
  }
}
