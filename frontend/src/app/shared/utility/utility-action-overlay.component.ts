import { Component, EventEmitter, HostListener, Input, Output } from "@angular/core";

@Component({
  selector: "app-utility-action-overlay",
  standalone: true,
  templateUrl: "./utility-action-overlay.component.html",
  styleUrl: "./utility-action-overlay.component.css"
})
export class UtilityActionOverlayComponent {
  @Input() isOpen = false;
  @Input() eyebrow = "Utility";
  @Input() title = "Coming Soon";
  @Input() description = "";
  @Input() hint = "";

  @Output() readonly closeRequested = new EventEmitter<void>();

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
}
