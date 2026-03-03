import { CommonModule } from "@angular/common";
import {
  AfterViewChecked,
  Component,
  ElementRef,
  EventEmitter,
  Input,
  OnChanges,
  Output,
  SimpleChanges,
  ViewChild
} from "@angular/core";
import type { DropEvent, ItemDefinition } from "../../api/account-api.service";
import {
  formatLootConsoleItemText,
  type LootConsoleLine,
  type LootConsoleLineItem,
  formatLootConsoleLineText,
  groupDropEventsToLootConsoleLines,
  lootItemRarityClass,
  shouldAutoScrollConsole
} from "./loot-console.helpers";

@Component({
  selector: "app-loot-console-window",
  standalone: true,
  imports: [CommonModule],
  templateUrl: "./loot-console-window.component.html",
  styleUrl: "./loot-console-window.component.css"
})
export class LootConsoleWindowComponent implements OnChanges, AfterViewChecked {
  @Input() dropEvents: ReadonlyArray<DropEvent> = [];
  @Input() itemCatalogById: Readonly<Record<string, ItemDefinition>> = {};

  @Output() readonly itemClicked = new EventEmitter<string>();

  @ViewChild("consoleBody", { static: false }) private readonly consoleBodyRef?: ElementRef<HTMLDivElement>;

  lines: LootConsoleLine[] = [];

  private clearMarkerDropEventId: string | null = null;
  private shouldScrollToBottom = false;

  ngOnChanges(_changes: SimpleChanges): void {
    const viewport = this.consoleBodyRef?.nativeElement;
    this.shouldScrollToBottom = !viewport ||
      shouldAutoScrollConsole(viewport.scrollTop, viewport.clientHeight, viewport.scrollHeight);

    this.rebuildLines();
  }

  ngAfterViewChecked(): void {
    if (!this.shouldScrollToBottom) {
      return;
    }

    const viewport = this.consoleBodyRef?.nativeElement;
    if (!viewport) {
      return;
    }

    viewport.scrollTop = viewport.scrollHeight;
    this.shouldScrollToBottom = false;
  }

  clearConsole(): void {
    this.clearMarkerDropEventId = this.dropEvents[0]?.dropEventId ?? this.clearMarkerDropEventId;
    this.rebuildLines();
    this.shouldScrollToBottom = true;
  }

  async copyLines(limit = 50): Promise<void> {
    const selected = this.lines.slice(Math.max(0, this.lines.length - limit));
    const text = selected.map((line) => this.formatLineText(line)).join("\n");
    if (text.length === 0) {
      return;
    }

    await copyTextBestEffort(text);
  }

  onItemClick(item: LootConsoleLineItem): void {
    if (!item.isInventoryItem) {
      return;
    }

    const itemId = item.itemId;
    this.itemClicked.emit(itemId);
  }

  formatPrefix(line: LootConsoleLine): string {
    return `${line.sourceType}@${line.tick}`;
  }

  formatLineText(line: LootConsoleLine): string {
    return formatLootConsoleLineText(line);
  }

  formatItemText(item: LootConsoleLineItem): string {
    return formatLootConsoleItemText(item);
  }

  itemClass(item: LootConsoleLineItem): string {
    return lootItemRarityClass(item);
  }

  trackLineByKey(_index: number, line: LootConsoleLine): string {
    return line.groupKey;
  }

  trackItemById(_index: number, item: Pick<LootConsoleLineItem, "itemKey">): string {
    return item.itemKey;
  }

  private rebuildLines(): void {
    this.lines = groupDropEventsToLootConsoleLines(this.resolveVisibleEvents(), this.itemCatalogById);
  }

  private resolveVisibleEvents(): ReadonlyArray<DropEvent> {
    if (!this.clearMarkerDropEventId) {
      return this.dropEvents;
    }

    const markerIndex = this.dropEvents.findIndex((event) => event.dropEventId === this.clearMarkerDropEventId);
    if (markerIndex < 0) {
      return this.dropEvents;
    }

    return this.dropEvents.slice(0, markerIndex);
  }
}

async function copyTextBestEffort(text: string): Promise<boolean> {
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Fall through to legacy path.
    }
  }

  if (typeof document === "undefined") {
    return false;
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  textarea.style.top = "0";
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();

  let copied = false;
  try {
    copied = document.execCommand("copy");
  } catch {
    copied = false;
  } finally {
    document.body.removeChild(textarea);
  }

  return copied;
}
