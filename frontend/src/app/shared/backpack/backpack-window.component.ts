import { CommonModule } from "@angular/common";
import { Component, ElementRef, EventEmitter, HostListener, Input, OnChanges, OnDestroy, Output, SimpleChanges } from "@angular/core";
import type { CharacterState, EquipmentDefinition, ItemDefinition } from "../../api/account-api.service";
import {
  type BackpackFilter,
  type BackpackSlot,
  filterBackpackSlots,
  mapInventoryToBackpackSlots
} from "./backpack-inventory.helpers";

type BackpackContextMenuState = Readonly<{
  slotId: string;
  x: number;
  y: number;
}>;

export type BackpackAssignRequest = Readonly<{
  characterId: string;
  instanceId: string;
}>;

export type BackpackEquipMode = "weapon" | null;

export type BackpackCharacterBadge = Readonly<{
  characterId: string;
  characterName: string;
  imageUrl: string | null;
  monogram: string;
  tone: string;
}>;

export type BackpackAssignTarget = Readonly<{
  characterId: string;
  characterName: string;
}>;

@Component({
  selector: "app-backpack-window",
  standalone: true,
  imports: [CommonModule],
  templateUrl: "./backpack-window.component.html",
  styleUrl: "./backpack-window.component.css"
})
export class BackpackWindowComponent implements OnChanges, OnDestroy {
  @Input() character: CharacterState | null = null;
  @Input() slots: ReadonlyArray<BackpackSlot> | null = null;
  @Input() itemCatalogById: Readonly<Record<string, ItemDefinition>> = {};
  @Input() equipmentCatalogByItemId: Readonly<Record<string, EquipmentDefinition>> = {};
  @Input() characterBadgeByInstanceId: Readonly<Record<string, BackpackCharacterBadge>> = {};
  @Input() assignTargets: ReadonlyArray<BackpackAssignTarget> = [];
  @Input() equipInFlight = false;
  @Input() highlightItemId: string | null = null;
  @Input() highlightRequestId = 0;
  @Input() forcedFilter: BackpackFilter | null = null;
  @Input() equipMode: BackpackEquipMode = null;

  @Output() readonly assignRequested = new EventEmitter<BackpackAssignRequest>();

  readonly filters: ReadonlyArray<BackpackFilter> = ["all", "ascendant", "legendary", "epic", "rare", "common"];
  readonly pageSize = 5;
  selectedFilter: BackpackFilter = "all";
  currentPage = 0;
  selectedSlotId: string | null = null;
  contextMenu: BackpackContextMenuState | null = null;
  pulsingSlotIds = new Set<string>();
  private readonly iconImageFailures = new Set<string>();
  private readonly characterImageFailures = new Set<string>();
  private pulseTimeoutBySlotId: Record<string, ReturnType<typeof setTimeout> | undefined> = {};

  constructor(private readonly hostRef: ElementRef<HTMLElement>) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (changes["highlightRequestId"]) {
      this.applyHighlightRequest();
    }

    if (changes["slots"] || changes["forcedFilter"] || changes["equipMode"]) {
      this.currentPage = this.clampPage(this.currentPage);
    }
  }

  ngOnDestroy(): void {
    for (const timeoutId of Object.values(this.pulseTimeoutBySlotId)) {
      if (!timeoutId) {
        continue;
      }

      clearTimeout(timeoutId);
    }
    this.pulseTimeoutBySlotId = {};
  }

  get allSlots(): BackpackSlot[] {
    if (this.slots) {
      return [...this.slots];
    }

    return mapInventoryToBackpackSlots(this.character, this.itemCatalogById, this.equipmentCatalogByItemId);
  }

  get visibleSlots(): BackpackSlot[] {
    if (this.equipMode) {
      return filterBackpackSlots(this.allSlots, this.resolveFilterForEquipMode(this.equipMode));
    }

    if (this.forcedFilter) {
      return filterBackpackSlots(this.allSlots, this.forcedFilter);
    }

    return filterBackpackSlots(this.allSlots, this.selectedFilter);
  }

  get visibleStoredSlots(): BackpackSlot[] {
    return this.visibleSlots;
  }

  get pagedVisibleStoredSlots(): BackpackSlot[] {
    const start = this.currentPage * this.pageSize;
    return this.visibleStoredSlots.slice(start, start + this.pageSize);
  }

  get shouldFillPagedInventory(): boolean {
    return this.pagedVisibleStoredSlots.length === this.pageSize;
  }

  get pageCount(): number {
    const total = this.visibleStoredSlots.length;
    return total > 0 ? Math.ceil(total / this.pageSize) : 1;
  }

  get pageLabel(): string {
    return `${this.currentPage + 1} / ${this.pageCount}`;
  }

  get isFirstPage(): boolean {
    return this.currentPage <= 0;
  }

  get isLastPage(): boolean {
    return this.currentPage >= this.pageCount - 1;
  }

  get selectedSlotRarityClass(): string {
    return this.selectedSlot?.rarityClass ?? "common";
  }

  get selectedSlot(): BackpackSlot | null {
    if (!this.selectedSlotId) {
      return null;
    }

    return this.allSlots.find((slot) => slot.slotId === this.selectedSlotId) ?? null;
  }

  setFilter(filter: BackpackFilter): void {
    if (this.equipMode) {
      return;
    }

    this.selectedFilter = filter;
    this.currentPage = 0;
    this.closeContextMenu();
  }

  goToPreviousPage(): void {
    this.currentPage = Math.max(0, this.currentPage - 1);
  }

  goToNextPage(): void {
    this.currentPage = Math.min(this.pageCount - 1, this.currentPage + 1);
  }

  selectSlot(slotId: string): void {
    this.selectedSlotId = slotId;
  }

  onGridContextMenu(event: MouseEvent): void {
    event.preventDefault();
  }

  onSlotContextMenu(slot: BackpackSlot, event: MouseEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.selectedSlotId = slot.slotId;

    const hostBounds = this.hostRef.nativeElement.getBoundingClientRect();
    const desiredX = Math.round(event.clientX - hostBounds.left + 6);
    const desiredY = Math.round(event.clientY - hostBounds.top + 6);
    const maxX = Math.max(0, hostBounds.width - 152);
    const maxY = Math.max(0, hostBounds.height - 88);
    this.contextMenu = {
      slotId: slot.slotId,
      x: Math.min(maxX, Math.max(0, desiredX)),
      y: Math.min(maxY, Math.max(0, desiredY))
    };
  }

  closeContextMenu(): void {
    this.contextMenu = null;
  }

  isFilterActive(filter: BackpackFilter): boolean {
    if (this.equipMode) {
      return this.resolveFilterForEquipMode(this.equipMode) === filter;
    }

    if (this.forcedFilter) {
      return this.forcedFilter === filter;
    }

    return this.selectedFilter === filter;
  }

  get equipModeHint(): string {
    if (this.equipMode === "weapon") {
      return "Select a weapon to equip.";
    }

    return "";
  }

  get slotCountLabel(): string {
    const count = this.visibleStoredSlots.length;
    return count === 1 ? "1 weapon" : `${count} weapons`;
  }

  get selectedSlotDescriptionLines(): ReadonlyArray<string> {
    const slot = this.selectedSlot;
    if (!slot) {
      return [];
    }

    const uniqueCoreLines: string[] = [];
    const seen = new Set<string>();
    const candidates = [slot.shortStatSummary, ...slot.detailStatLines];
    for (const candidate of candidates) {
      const value = (candidate ?? "").trim();
      if (!value) {
        continue;
      }

      const key = value.toLowerCase();
      if (seen.has(key)) {
        continue;
      }

      seen.add(key);
      uniqueCoreLines.push(value);
      if (uniqueCoreLines.length >= 2) {
        break;
      }
    }

    while (uniqueCoreLines.length < 2) {
      uniqueCoreLines.push(uniqueCoreLines.length === 0 ? "Balanced weapon profile." : `Class: ${slot.typeLabel}`);
    }

    const equippedBadge = this.getCharacterBadge(slot);
    const thirdLine = equippedBadge
      ? `Equipped by ${equippedBadge.characterName}.`
      : "Stored in account backpack.";

    return [uniqueCoreLines[0], uniqueCoreLines[1], thirdLine];
  }

  get selectedSlotTypeLabel(): string {
    if (!this.selectedSlot) {
      return "Item";
    }

    return this.selectedSlot.slotLabel;
  }

  get selectedSlotStateLabel(): string {
    return this.selectedSlot?.isEquipped ? "Equipped" : "Stored";
  }

  onAssignToCharacter(characterId: string): void {
    const slot = this.selectedSlot;
    if (!slot || this.isAssignToCharacterDisabled(characterId, slot)) {
      return;
    }

    this.assignRequested.emit({
      characterId,
      instanceId: slot.instanceId
    });
    this.closeContextMenu();
  }

  isAssignToCharacterDisabled(characterId: string, slot: BackpackSlot | null): boolean {
    if (!slot || this.equipInFlight) {
      return true;
    }

    const currentBadge = this.getCharacterBadge(slot);
    if (!currentBadge) {
      return false;
    }

    return currentBadge.characterId === characterId;
  }

  getCharacterBadge(slot: BackpackSlot | null | undefined): BackpackCharacterBadge | null {
    if (!slot?.isEquipped) {
      return null;
    }

    return this.characterBadgeByInstanceId[slot.instanceId] ?? null;
  }

  shouldRenderCharacterImage(slot: BackpackSlot | null | undefined): boolean {
    const badge = this.getCharacterBadge(slot);
    if (!badge?.imageUrl) {
      return false;
    }

    return !this.characterImageFailures.has(badge.characterId);
  }

  onCharacterImageError(characterId: string | null | undefined): void {
    if (!characterId) {
      return;
    }

    this.characterImageFailures.add(characterId);
  }

  isSlotPulsing(slotId: string): boolean {
    return this.pulsingSlotIds.has(slotId);
  }

  shouldRenderItemIconImage(slot: BackpackSlot | null | undefined): boolean {
    if (!slot?.iconImageUrl) {
      return false;
    }

    return !this.iconImageFailures.has(slot.slotId);
  }

  onItemIconError(slotId: string): void {
    if (!slotId) {
      return;
    }

    this.iconImageFailures.add(slotId);
  }

  getSlotFallbackGlyph(slot: "weapon"): string {
    return "WP";
  }

  getSlotFallbackTone(slot: "weapon"): string {
    return "weapon";
  }

  trackSlotById(_index: number, slot: BackpackSlot): string {
    return slot.slotId;
  }

  @HostListener("document:mousedown", ["$event"])
  onDocumentMouseDown(event: MouseEvent): void {
    if (!this.contextMenu) {
      return;
    }

    const target = event.target as Node | null;
    if (!target) {
      this.closeContextMenu();
      return;
    }

    if (!this.hostRef.nativeElement.contains(target)) {
      this.closeContextMenu();
    }
  }

  @HostListener("window:keydown", ["$event"])
  onWindowKeyDown(event: KeyboardEvent): void {
    if (event.key !== "Escape") {
      return;
    }

    if (!this.contextMenu) {
      return;
    }

    event.preventDefault();
    this.closeContextMenu();
  }

  private applyHighlightRequest(): void {
    if (!this.highlightItemId || this.highlightRequestId <= 0) {
      return;
    }

    const slots = this.allSlots.filter((slot) => slot.itemId === this.highlightItemId);
    if (slots.length === 0) {
      return;
    }

    this.selectedSlotId = slots[0].slotId;
    this.closeContextMenu();

    const nextPulsing = new Set(this.pulsingSlotIds);
    for (const slot of slots) {
      nextPulsing.add(slot.slotId);

      const priorTimeout = this.pulseTimeoutBySlotId[slot.slotId];
      if (priorTimeout) {
        clearTimeout(priorTimeout);
      }

      this.pulseTimeoutBySlotId[slot.slotId] = setTimeout(() => {
        const reduced = new Set(this.pulsingSlotIds);
        reduced.delete(slot.slotId);
        this.pulsingSlotIds = reduced;
        this.pulseTimeoutBySlotId[slot.slotId] = undefined;
      }, 1500);
    }

    this.pulsingSlotIds = nextPulsing;
  }

  private resolveFilterForEquipMode(equipMode: Exclude<BackpackEquipMode, null>): BackpackFilter {
    return "all";
  }

  private clampPage(value: number): number {
    const maxPage = Math.max(0, this.pageCount - 1);
    return Math.min(Math.max(0, value), maxPage);
  }
}
