import { CommonModule } from "@angular/common";
import { Component, ElementRef, EventEmitter, HostListener, Input, OnChanges, OnDestroy, Output, SimpleChanges } from "@angular/core";
import type { CharacterState, EquipmentDefinition, EquipmentSlot, ItemDefinition } from "../../api/account-api.service";
import {
  type BackpackFilter,
  type BackpackSlot,
  filterBackpackSlots,
  mapInventoryToBackpackSlots
} from "./backpack-inventory.helpers";

type BackpackContextMenuAction = "equip" | "inspect";

type BackpackContextMenuState = Readonly<{
  slotId: string;
  x: number;
  y: number;
}>;

export type BackpackEquipRequest = Readonly<{
  instanceId: string;
  slot: EquipmentSlot;
}>;

export type BackpackEquipMode = "weapon" | "armor" | "relic" | null;

@Component({
  selector: "app-backpack-window",
  standalone: true,
  imports: [CommonModule],
  templateUrl: "./backpack-window.component.html",
  styleUrl: "./backpack-window.component.css"
})
export class BackpackWindowComponent implements OnChanges, OnDestroy {
  @Input() character: CharacterState | null = null;
  @Input() itemCatalogById: Readonly<Record<string, ItemDefinition>> = {};
  @Input() equipmentCatalogByItemId: Readonly<Record<string, EquipmentDefinition>> = {};
  @Input() equipInFlight = false;
  @Input() salvageInFlight = false;
  @Input() highlightItemId: string | null = null;
  @Input() highlightRequestId = 0;
  @Input() forcedFilter: BackpackFilter | null = null;
  @Input() equipMode: BackpackEquipMode = null;

  @Output() readonly equipRequested = new EventEmitter<BackpackEquipRequest>();
  @Output() readonly salvageRequested = new EventEmitter<string>();

  readonly filters: ReadonlyArray<BackpackFilter> = ["all", "weapons", "armor", "relics"];
  selectedFilter: BackpackFilter = "all";
  selectedSlotId: string | null = null;
  inspectSlotId: string | null = null;
  contextMenu: BackpackContextMenuState | null = null;
  pulsingSlotIds = new Set<string>();
  private pulseTimeoutBySlotId: Record<string, ReturnType<typeof setTimeout> | undefined> = {};

  constructor(private readonly hostRef: ElementRef<HTMLElement>) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (changes["highlightRequestId"]) {
      this.applyHighlightRequest();
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

  get selectedSlot(): BackpackSlot | null {
    if (!this.selectedSlotId) {
      return null;
    }

    return this.allSlots.find((slot) => slot.slotId === this.selectedSlotId) ?? null;
  }

  get inspectSlot(): BackpackSlot | null {
    if (!this.inspectSlotId) {
      return null;
    }

    return this.allSlots.find((slot) => slot.slotId === this.inspectSlotId) ?? null;
  }

  setFilter(filter: BackpackFilter): void {
    if (this.equipMode) {
      return;
    }

    this.selectedFilter = filter;
    this.closeContextMenu();
  }

  selectSlot(slotId: string): void {
    const slot = this.allSlots.find((entry) => entry.slotId === slotId) ?? null;
    if (this.equipMode && this.tryEmitEquip(slot)) {
      return;
    }

    this.selectedSlotId = slotId;
  }

  onGridContextMenu(event: MouseEvent): void {
    event.preventDefault();
  }

  onSlotContextMenu(slot: BackpackSlot, event: MouseEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.selectedSlotId = slot.slotId;
    this.inspectSlotId = null;

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

  onContextMenuAction(action: BackpackContextMenuAction): void {
    const slot = this.selectedSlot;
    if (!slot) {
      this.closeContextMenu();
      return;
    }

    if (action === "equip") {
      this.tryEmitEquip(slot);
      this.closeContextMenu();
      return;
    }

    this.inspectSlotId = slot.slotId;
    this.closeContextMenu();
  }

  closeContextMenu(): void {
    this.contextMenu = null;
  }

  closeInspect(): void {
    this.inspectSlotId = null;
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

    if (this.equipMode === "armor") {
      return "Select armor to equip.";
    }

    if (this.equipMode === "relic") {
      return "Select a relic to equip.";
    }

    return "";
  }

  canEquip(slot: BackpackSlot | null): boolean {
    return !!slot && !!this.resolveEquipSlot(slot) && !slot.isEquipped && !this.equipInFlight;
  }

  canSalvage(slot: BackpackSlot | null): boolean {
    return !!slot &&
      !!slot.originSpeciesId &&
      this.resolveSalvagePrimalCoreReturn(slot.rarity) !== null;
  }

  getSelectedSlotSalvagePrimalCoreReturn(): number | null {
    return this.resolveSalvagePrimalCoreReturn(this.selectedSlot?.rarity);
  }

  onSalvageSelectedSlot(): void {
    const slot = this.selectedSlot;
    if (!this.canSalvage(slot) || !slot?.instanceId) {
      return;
    }

    const returnAmount = this.resolveSalvagePrimalCoreReturn(slot.rarity);
    if (returnAmount === null) {
      return;
    }

    const shouldProceed = typeof window === "undefined"
      ? true
      : window.confirm(`Salvage ${slot.displayName}? You will receive ${returnAmount} Primal Core.`);
    if (!shouldProceed) {
      return;
    }

    this.salvageRequested.emit(slot.instanceId);
  }

  onEquipSelectedSlot(): void {
    this.tryEmitEquip(this.selectedSlot);
  }

  isSlotPulsing(slotId: string): boolean {
    return this.pulsingSlotIds.has(slotId);
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

    if (!this.contextMenu && !this.inspectSlotId) {
      return;
    }

    event.preventDefault();
    this.closeContextMenu();
    this.closeInspect();
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
    this.inspectSlotId = null;
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

  private resolveSalvagePrimalCoreReturn(rarity: string | null | undefined): number | null {
    const normalizedRarity = (rarity ?? "").trim().toLowerCase();
    if (normalizedRarity === "common") {
      return 12;
    }

    if (normalizedRarity === "rare") {
      return 28;
    }

    if (normalizedRarity === "epic") {
      return 96;
    }

    if (normalizedRarity === "legendary") {
      return 250;
    }

    return null;
  }

  private tryEmitEquip(slot: BackpackSlot | null): boolean {
    const equipSlot = this.resolveEquipSlot(slot);
    if (!slot || !equipSlot || slot.isEquipped || this.equipInFlight) {
      return false;
    }

    this.equipRequested.emit({
      instanceId: slot.instanceId,
      slot: equipSlot
    });
    return true;
  }

  private resolveEquipSlot(slot: BackpackSlot | null): EquipmentSlot | null {
    if (!slot) {
      return null;
    }

    if (slot.slot === "weapon" || slot.slot === "armor" || slot.slot === "relic") {
      return slot.slot;
    }

    return null;
  }

  private resolveFilterForEquipMode(equipMode: Exclude<BackpackEquipMode, null>): BackpackFilter {
    if (equipMode === "weapon") {
      return "weapons";
    }

    if (equipMode === "armor") {
      return "armor";
    }

    return "relics";
  }
}
