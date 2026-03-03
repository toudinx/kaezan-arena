import { CommonModule } from "@angular/common";
import { AfterViewChecked, Component, ElementRef, Input, OnChanges, SimpleChanges, ViewChild } from "@angular/core";
import {
  type DamageConsoleEntry,
  type DamageConsoleFilterId,
  type DamageConsoleTickGroup,
  formatDamageTickLabel,
  groupDamageConsoleEntriesByTick,
  matchesDamageConsoleFilter,
  resolveDamageConsoleLineClass,
  shouldAutoScrollDamageConsole
} from "./damage-console.helpers";

@Component({
  selector: "app-damage-console",
  standalone: true,
  imports: [CommonModule],
  templateUrl: "./damage-console.component.html",
  styleUrl: "./damage-console.component.css"
})
export class DamageConsoleComponent implements OnChanges, AfterViewChecked {
  @Input() entries: ReadonlyArray<DamageConsoleEntry> = [];

  @ViewChild("consoleBody", { static: false }) private readonly consoleBodyRef?: ElementRef<HTMLDivElement>;

  readonly filters: ReadonlyArray<DamageConsoleFilterId> = ["all", "incoming", "outgoing", "heal"];
  selectedFilter: DamageConsoleFilterId = "all";
  followEnabled = true;
  visibleEntries: DamageConsoleEntry[] = [];

  private clearMarkerEntryId: string | null = null;
  private shouldScrollToBottom = false;

  ngOnChanges(_changes: SimpleChanges): void {
    const viewport = this.consoleBodyRef?.nativeElement;
    const nearBottom = !viewport || shouldAutoScrollDamageConsole(viewport.scrollTop, viewport.clientHeight, viewport.scrollHeight);
    this.shouldScrollToBottom = this.followEnabled || nearBottom;
    this.rebuildVisibleEntries();
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

  get filteredEntries(): DamageConsoleEntry[] {
    return this.visibleEntries.filter((entry) => matchesDamageConsoleFilter(entry, this.selectedFilter));
  }

  get groupedEntries(): ReadonlyArray<DamageConsoleTickGroup> {
    return groupDamageConsoleEntriesByTick(this.filteredEntries);
  }

  setFilter(filter: DamageConsoleFilterId): void {
    this.selectedFilter = filter;
  }

  setFollowEnabled(event: Event): void {
    const checked = (event.target as HTMLInputElement | null)?.checked ?? this.followEnabled;
    this.followEnabled = checked;
    if (this.followEnabled) {
      this.shouldScrollToBottom = true;
    }
  }

  clearConsole(): void {
    const newest = this.entries[this.entries.length - 1];
    if (newest) {
      this.clearMarkerEntryId = newest.entryId;
    }

    this.rebuildVisibleEntries();
    this.shouldScrollToBottom = true;
  }

  async copyLines(limit = 50): Promise<void> {
    const selected = this.filteredEntries.slice(Math.max(0, this.filteredEntries.length - limit));
    const text = selected.map((entry) => `${formatDamageTickLabel(entry.tick)} ${entry.message}`).join("\n");
    if (text.length === 0) {
      return;
    }

    await copyTextBestEffort(text);
  }

  isFilterActive(filter: DamageConsoleFilterId): boolean {
    return this.selectedFilter === filter;
  }

  formatTickLabel(tick: number): string {
    return formatDamageTickLabel(tick);
  }

  lineClass(entry: DamageConsoleEntry): string {
    return resolveDamageConsoleLineClass(entry.kind);
  }

  trackGroupByKey(_index: number, group: DamageConsoleTickGroup): string {
    return group.groupKey;
  }

  trackEntryById(_index: number, entry: DamageConsoleEntry): string {
    return entry.entryId;
  }

  private rebuildVisibleEntries(): void {
    this.visibleEntries = this.resolveVisibleEntries();
  }

  private resolveVisibleEntries(): DamageConsoleEntry[] {
    if (!this.clearMarkerEntryId) {
      return [...this.entries];
    }

    const markerIndex = this.entries.findIndex((entry) => entry.entryId === this.clearMarkerEntryId);
    if (markerIndex < 0) {
      return [...this.entries];
    }

    return this.entries.slice(markerIndex + 1);
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
