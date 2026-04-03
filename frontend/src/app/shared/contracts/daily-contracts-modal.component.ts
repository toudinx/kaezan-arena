import { Component, EventEmitter, HostListener, Input, Output } from "@angular/core";

export type DailyContractStatus = "in_progress" | "claimable" | "resolved";

export type DailyContractRowViewModel = Readonly<{
  contractId: string;
  description: string;
  progressText: string;
  progressPercent: number;
  kaerosReward: number;
  accountXpRewardLabel: string | null;
  status: DailyContractStatus;
  statusLabel: string;
  statusHint: string;
}>;

@Component({
  selector: "app-daily-contracts-modal",
  standalone: true,
  templateUrl: "./daily-contracts-modal.component.html",
  styleUrl: "./daily-contracts-modal.component.css"
})
export class DailyContractsModalComponent {
  @Input() isOpen = false;
  @Input() isRefreshing = false;
  @Input() loadError: string | null = null;
  @Input() assignedDateLabel = "";
  @Input() resetLabel = "";
  @Input() accountXpHint = "";
  @Input() rows: ReadonlyArray<DailyContractRowViewModel> = [];

  @Output() readonly closeRequested = new EventEmitter<void>();
  @Output() readonly refreshRequested = new EventEmitter<void>();

  @HostListener("document:keydown", ["$event"])
  onDocumentKeyDown(event: KeyboardEvent): void {
    if (!this.isOpen || event.key !== "Escape") {
      return;
    }

    event.preventDefault();
    this.requestClose();
  }

  onBackdropClick(): void {
    this.requestClose();
  }

  onPanelClick(event: MouseEvent): void {
    event.stopPropagation();
  }

  requestClose(): void {
    this.closeRequested.emit();
  }

  requestRefresh(): void {
    this.refreshRequested.emit();
  }
}
