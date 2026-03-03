import { ChangeDetectionStrategy, Component, EventEmitter, HostListener, Input, Output } from "@angular/core";
import { clampWindowPosition } from "./window-clamp.helpers";

export type UiWindowPositionChangedEvent = Readonly<{
  id: string;
  x: number;
  y: number;
}>;

@Component({
  selector: "app-ui-window",
  standalone: true,
  templateUrl: "./ui-window.component.html",
  styleUrl: "./ui-window.component.css",
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class UiWindowComponent {
  @Input({ required: true }) id = "";
  @Input({ required: true }) title = "";
  @Input() x = 0;
  @Input() y = 0;
  @Input() width = 320;
  @Input() height = 220;
  @Input() isOpen = true;
  @Input() zIndex = 1;
  @Input() minWidth = 220;
  @Input() minHeight = 140;
  @Input() isResizable = false;
  @Input() isPinned = false;
  @Input() isMinimized = false;

  @Output() readonly requestBringToFront = new EventEmitter<string>();
  @Output() readonly requestClose = new EventEmitter<string>();
  @Output() readonly requestToggleMinimized = new EventEmitter<string>();
  @Output() readonly positionChanged = new EventEmitter<UiWindowPositionChangedEvent>();

  readonly titleBarHeightPx = 34;

  private dragStartX = 0;
  private dragStartY = 0;
  private windowStartX = 0;
  private windowStartY = 0;
  private dragging = false;

  get renderedHeight(): number {
    if (this.isMinimized) {
      return this.titleBarHeightPx;
    }

    return Math.max(this.minHeight, this.height);
  }

  onWindowMouseDown(): void {
    this.requestBringToFront.emit(this.id);
  }

  onTitleBarMouseDown(event: MouseEvent): void {
    if (this.isPinned || event.button !== 0) {
      return;
    }

    this.requestBringToFront.emit(this.id);
    this.dragging = true;
    this.dragStartX = event.clientX;
    this.dragStartY = event.clientY;
    this.windowStartX = this.x;
    this.windowStartY = this.y;
    event.preventDefault();
  }

  onCloseButtonClick(event: MouseEvent): void {
    event.stopPropagation();
    event.preventDefault();
    this.requestClose.emit(this.id);
  }

  onMinimizeButtonClick(event: MouseEvent): void {
    event.stopPropagation();
    event.preventDefault();
    this.requestToggleMinimized.emit(this.id);
  }

  @HostListener("window:mousemove", ["$event"])
  onWindowMouseMove(event: MouseEvent): void {
    if (!this.dragging) {
      return;
    }

    const deltaX = event.clientX - this.dragStartX;
    const deltaY = event.clientY - this.dragStartY;
    const clamped = clampWindowPosition({
      x: this.windowStartX + deltaX,
      y: this.windowStartY + deltaY,
      width: Math.max(this.minWidth, this.width),
      height: this.renderedHeight,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight
    });

    this.positionChanged.emit({
      id: this.id,
      x: clamped.x,
      y: clamped.y
    });
  }

  @HostListener("window:mouseup")
  onWindowMouseUp(): void {
    this.dragging = false;
  }
}
