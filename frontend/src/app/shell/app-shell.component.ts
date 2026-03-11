import { Component, HostListener } from "@angular/core";
import { RouterLink, RouterLinkActive, RouterOutlet } from "@angular/router";
import { BackpackDrawerComponent } from "../shared/backpack/backpack-drawer.component";

@Component({
  selector: "app-shell",
  standalone: true,
  imports: [RouterLink, RouterLinkActive, RouterOutlet, BackpackDrawerComponent],
  templateUrl: "./app-shell.component.html",
  styleUrl: "./app-shell.component.css"
})
export class AppShellComponent {
  isBackpackOpen = false;

  toggleBackpack(): void {
    this.isBackpackOpen = !this.isBackpackOpen;
  }

  closeBackpack(): void {
    this.isBackpackOpen = false;
  }

  @HostListener("document:keydown", ["$event"])
  onDocumentKeyDown(event: KeyboardEvent): void {
    if (event.key.toLowerCase() !== "b" || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) {
      return;
    }

    if (this.isTypingContext()) {
      return;
    }

    event.preventDefault();
    this.toggleBackpack();
  }

  @HostListener("window:kaezan-open-backpack")
  onOpenBackpackRequested(): void {
    this.isBackpackOpen = true;
  }

  private isTypingContext(): boolean {
    const activeElement = document.activeElement;
    if (!activeElement) {
      return false;
    }

    if (
      activeElement instanceof HTMLInputElement ||
      activeElement instanceof HTMLTextAreaElement ||
      activeElement instanceof HTMLSelectElement
    ) {
      return true;
    }

    return activeElement instanceof HTMLElement && activeElement.isContentEditable;
  }
}
