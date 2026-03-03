import { Injectable, computed, signal } from "@angular/core";
import { clampWindowPosition } from "../../arena/ui/window-clamp.helpers";

export const UI_LAYOUT_STORAGE_KEY = "kaezan_arena_ui_layout_v1";

export const ARENA_UI_WINDOW_IDS = {
  statusSkills: "status_skills",
  backpack: "backpack",
  lootFeed: "loot_feed",
  equipmentCharacter: "equipment_character"
} as const;

export type ArenaUiWindowId = (typeof ARENA_UI_WINDOW_IDS)[keyof typeof ARENA_UI_WINDOW_IDS];

export type UiWindowLayout = Readonly<{
  id: ArenaUiWindowId;
  title: string;
  x: number;
  y: number;
  width: number;
  height: number;
  isOpen: boolean;
  zIndex: number;
  minWidth: number;
  minHeight: number;
  isResizable: boolean;
  isPinned: boolean;
  isMinimized: boolean;
}>;

type StoredUiWindowLayout = {
  id: ArenaUiWindowId;
  x: number;
  y: number;
  width: number;
  height: number;
  isOpen: boolean;
  zIndex: number;
  isMinimized: boolean;
};

const DEFAULT_VIEWPORT_WIDTH = 1280;
const DEFAULT_VIEWPORT_HEIGHT = 720;
const DEFAULT_WINDOW_MIN_WIDTH = 220;
const DEFAULT_WINDOW_MIN_HEIGHT = 140;
const WINDOW_BASE_Z_INDEX = 120;

@Injectable({ providedIn: "root" })
export class UiLayoutService {
  private readonly windowsById = signal<Record<ArenaUiWindowId, UiWindowLayout>>(this.loadInitialLayout());
  readonly windows = computed(() => Object.values(this.windowsById()).sort((left, right) => left.zIndex - right.zIndex));

  open(id: ArenaUiWindowId): void {
    this.updateWindow(id, (windowState, allWindows) => ({
      ...windowState,
      isOpen: true,
      zIndex: this.getHighestZIndex(allWindows) + 1
    }));
  }

  close(id: ArenaUiWindowId): void {
    this.updateWindow(id, (windowState) => ({
      ...windowState,
      isOpen: false
    }));
  }

  toggle(id: ArenaUiWindowId): void {
    const windowState = this.getWindow(id);
    if (!windowState) {
      return;
    }

    if (windowState.isOpen) {
      this.close(id);
      return;
    }

    this.open(id);
  }

  bringToFront(id: ArenaUiWindowId): void {
    this.updateWindow(id, (windowState, allWindows) => ({
      ...windowState,
      zIndex: this.getHighestZIndex(allWindows) + 1
    }));
  }

  setPosition(id: ArenaUiWindowId, x: number, y: number): void {
    this.updateWindow(id, (windowState) => {
      const viewport = this.getViewportSize();
      const clamped = clampWindowPosition({
        x,
        y,
        width: windowState.width,
        height: windowState.isMinimized ? this.getMinimizedHeight() : windowState.height,
        viewportWidth: viewport.width,
        viewportHeight: viewport.height
      });

      return {
        ...windowState,
        x: clamped.x,
        y: clamped.y
      };
    });
  }

  setSize(id: ArenaUiWindowId, width: number, height: number): void {
    this.updateWindow(id, (windowState) => {
      const nextWidth = Math.max(windowState.minWidth, Math.round(width));
      const nextHeight = Math.max(windowState.minHeight, Math.round(height));
      const viewport = this.getViewportSize();
      const clamped = clampWindowPosition({
        x: windowState.x,
        y: windowState.y,
        width: nextWidth,
        height: windowState.isMinimized ? this.getMinimizedHeight() : nextHeight,
        viewportWidth: viewport.width,
        viewportHeight: viewport.height
      });

      return {
        ...windowState,
        x: clamped.x,
        y: clamped.y,
        width: nextWidth,
        height: nextHeight
      };
    });
  }

  toggleMinimized(id: ArenaUiWindowId): void {
    this.updateWindow(id, (windowState) => ({
      ...windowState,
      isMinimized: !windowState.isMinimized
    }));
  }

  clampAllToViewport(): void {
    const current = this.windowsById();
    const viewport = this.getViewportSize();
    const next: Partial<Record<ArenaUiWindowId, UiWindowLayout>> = {};
    let didChange = false;

    for (const windowState of Object.values(current)) {
      const clamped = clampWindowPosition({
        x: windowState.x,
        y: windowState.y,
        width: windowState.width,
        height: windowState.isMinimized ? this.getMinimizedHeight() : windowState.height,
        viewportWidth: viewport.width,
        viewportHeight: viewport.height
      });

      if (clamped.x !== windowState.x || clamped.y !== windowState.y) {
        didChange = true;
        next[windowState.id] = {
          ...windowState,
          x: clamped.x,
          y: clamped.y
        };
      }
    }

    if (!didChange) {
      return;
    }

    this.windowsById.set({
      ...current,
      ...next
    });
    this.persistLayout();
  }

  getWindow(id: ArenaUiWindowId): UiWindowLayout | null {
    return this.windowsById()[id] ?? null;
  }

  private updateWindow(
    id: ArenaUiWindowId,
    updater: (windowState: UiWindowLayout, allWindows: Record<ArenaUiWindowId, UiWindowLayout>) => UiWindowLayout
  ): void {
    const current = this.windowsById();
    const existing = current[id];
    if (!existing) {
      return;
    }

    const nextWindow = updater(existing, current);
    if (this.isSameWindowState(existing, nextWindow)) {
      return;
    }

    this.windowsById.set({
      ...current,
      [id]: nextWindow
    });
    this.persistLayout();
  }

  private isSameWindowState(left: UiWindowLayout, right: UiWindowLayout): boolean {
    return left.id === right.id &&
      left.title === right.title &&
      left.x === right.x &&
      left.y === right.y &&
      left.width === right.width &&
      left.height === right.height &&
      left.isOpen === right.isOpen &&
      left.zIndex === right.zIndex &&
      left.minWidth === right.minWidth &&
      left.minHeight === right.minHeight &&
      left.isResizable === right.isResizable &&
      left.isPinned === right.isPinned &&
      left.isMinimized === right.isMinimized;
  }

  private loadInitialLayout(): Record<ArenaUiWindowId, UiWindowLayout> {
    const viewport = this.getViewportSize();
    const defaults = this.buildDefaultLayout(viewport.width, viewport.height);
    const saved = this.readStoredLayout();
    if (saved.length === 0) {
      return this.normalizeWindowStack(defaults);
    }

    const merged: Record<ArenaUiWindowId, UiWindowLayout> = { ...defaults };
    for (const savedWindow of saved) {
      const base = merged[savedWindow.id];
      if (!base) {
        continue;
      }

      const width = Math.max(base.minWidth, Math.round(this.coerceNumber(savedWindow.width, base.width)));
      const height = Math.max(base.minHeight, Math.round(this.coerceNumber(savedWindow.height, base.height)));
      const clamped = clampWindowPosition({
        x: this.coerceNumber(savedWindow.x, base.x),
        y: this.coerceNumber(savedWindow.y, base.y),
        width,
        height: this.coerceBoolean(savedWindow.isMinimized, base.isMinimized) ? this.getMinimizedHeight() : height,
        viewportWidth: viewport.width,
        viewportHeight: viewport.height
      });

      merged[savedWindow.id] = {
        ...base,
        x: clamped.x,
        y: clamped.y,
        width,
        height,
        isOpen: this.coerceBoolean(savedWindow.isOpen, base.isOpen),
        zIndex: Math.round(this.coerceNumber(savedWindow.zIndex, base.zIndex)),
        isMinimized: this.coerceBoolean(savedWindow.isMinimized, base.isMinimized)
      };
    }

    return this.normalizeWindowStack(merged);
  }

  private normalizeWindowStack(windowsById: Record<ArenaUiWindowId, UiWindowLayout>): Record<ArenaUiWindowId, UiWindowLayout> {
    const sorted = Object.values(windowsById).sort((left, right) => {
      if (left.zIndex === right.zIndex) {
        return left.id.localeCompare(right.id);
      }

      return left.zIndex - right.zIndex;
    });

    const normalized = {} as Record<ArenaUiWindowId, UiWindowLayout>;
    let zIndex = WINDOW_BASE_Z_INDEX;
    for (const windowState of sorted) {
      normalized[windowState.id] = {
        ...windowState,
        zIndex
      };
      zIndex += 1;
    }

    return normalized;
  }

  private buildDefaultLayout(viewportWidth: number, viewportHeight: number): Record<ArenaUiWindowId, UiWindowLayout> {
    const presets: Array<Omit<UiWindowLayout, "x" | "y"> & { x: number; y: number }> = [
      {
        id: ARENA_UI_WINDOW_IDS.equipmentCharacter,
        title: "Equipment / Character",
        x: 20,
        y: 84,
        width: 330,
        height: 240,
        isOpen: true,
        zIndex: WINDOW_BASE_Z_INDEX,
        minWidth: DEFAULT_WINDOW_MIN_WIDTH,
        minHeight: DEFAULT_WINDOW_MIN_HEIGHT,
        isResizable: false,
        isPinned: false,
        isMinimized: false
      },
      {
        id: ARENA_UI_WINDOW_IDS.statusSkills,
        title: "Status / Skills",
        x: viewportWidth - 350,
        y: 84,
        width: 330,
        height: 220,
        isOpen: true,
        zIndex: WINDOW_BASE_Z_INDEX + 1,
        minWidth: DEFAULT_WINDOW_MIN_WIDTH,
        minHeight: DEFAULT_WINDOW_MIN_HEIGHT,
        isResizable: false,
        isPinned: false,
        isMinimized: false
      },
      {
        id: ARENA_UI_WINDOW_IDS.backpack,
        title: "Backpack",
        x: viewportWidth - 350,
        y: 320,
        width: 330,
        height: 220,
        isOpen: true,
        zIndex: WINDOW_BASE_Z_INDEX + 2,
        minWidth: DEFAULT_WINDOW_MIN_WIDTH,
        minHeight: DEFAULT_WINDOW_MIN_HEIGHT,
        isResizable: false,
        isPinned: false,
        isMinimized: false
      },
      {
        id: ARENA_UI_WINDOW_IDS.lootFeed,
        title: "Loot Feed",
        x: 20,
        y: viewportHeight - 250,
        width: 330,
        height: 220,
        isOpen: true,
        zIndex: WINDOW_BASE_Z_INDEX + 3,
        minWidth: DEFAULT_WINDOW_MIN_WIDTH,
        minHeight: DEFAULT_WINDOW_MIN_HEIGHT,
        isResizable: false,
        isPinned: false,
        isMinimized: false
      }
    ];

    const byId = {} as Record<ArenaUiWindowId, UiWindowLayout>;
    for (const preset of presets) {
      const clamped = clampWindowPosition({
        x: preset.x,
        y: preset.y,
        width: preset.width,
        height: preset.height,
        viewportWidth,
        viewportHeight
      });

      byId[preset.id] = {
        ...preset,
        x: clamped.x,
        y: clamped.y
      };
    }

    return byId;
  }

  private readStoredLayout(): StoredUiWindowLayout[] {
    if (!this.canUseStorage()) {
      return [];
    }

    try {
      const raw = window.localStorage.getItem(UI_LAYOUT_STORAGE_KEY);
      if (!raw) {
        return [];
      }

      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) {
        return [];
      }

      const entries: StoredUiWindowLayout[] = [];
      for (const entry of parsed) {
        if (!entry || typeof entry !== "object") {
          continue;
        }

        const candidate = entry as Partial<StoredUiWindowLayout>;
        if (!candidate.id || !this.isKnownWindowId(candidate.id)) {
          continue;
        }

        entries.push({
          id: candidate.id,
          x: this.coerceNumber(candidate.x, 0),
          y: this.coerceNumber(candidate.y, 0),
          width: this.coerceNumber(candidate.width, 0),
          height: this.coerceNumber(candidate.height, 0),
          isOpen: this.coerceBoolean(candidate.isOpen, true),
          zIndex: this.coerceNumber(candidate.zIndex, WINDOW_BASE_Z_INDEX),
          isMinimized: this.coerceBoolean(candidate.isMinimized, false)
        });
      }

      return entries;
    } catch {
      return [];
    }
  }

  private persistLayout(): void {
    if (!this.canUseStorage()) {
      return;
    }

    try {
      const serializable: StoredUiWindowLayout[] = this.windows().map((windowState) => ({
        id: windowState.id,
        x: windowState.x,
        y: windowState.y,
        width: windowState.width,
        height: windowState.height,
        isOpen: windowState.isOpen,
        zIndex: windowState.zIndex,
        isMinimized: windowState.isMinimized
      }));
      window.localStorage.setItem(UI_LAYOUT_STORAGE_KEY, JSON.stringify(serializable));
    } catch {
      // Ignore storage failures so gameplay input is never blocked by persistence errors.
    }
  }

  private getHighestZIndex(allWindows: Record<ArenaUiWindowId, UiWindowLayout>): number {
    let highest = WINDOW_BASE_Z_INDEX;
    for (const windowState of Object.values(allWindows)) {
      highest = Math.max(highest, windowState.zIndex);
    }

    return highest;
  }

  private getViewportSize(): { width: number; height: number } {
    if (typeof window === "undefined") {
      return {
        width: DEFAULT_VIEWPORT_WIDTH,
        height: DEFAULT_VIEWPORT_HEIGHT
      };
    }

    return {
      width: Math.max(1, Math.floor(window.innerWidth || DEFAULT_VIEWPORT_WIDTH)),
      height: Math.max(1, Math.floor(window.innerHeight || DEFAULT_VIEWPORT_HEIGHT))
    };
  }

  private canUseStorage(): boolean {
    if (typeof window === "undefined") {
      return false;
    }

    try {
      return typeof window.localStorage !== "undefined";
    } catch {
      return false;
    }
  }

  private coerceNumber(value: unknown, fallback: number): number {
    return typeof value === "number" && Number.isFinite(value) ? value : fallback;
  }

  private coerceBoolean(value: unknown, fallback: boolean): boolean {
    return typeof value === "boolean" ? value : fallback;
  }

  private isKnownWindowId(value: string): value is ArenaUiWindowId {
    return value === ARENA_UI_WINDOW_IDS.statusSkills ||
      value === ARENA_UI_WINDOW_IDS.backpack ||
      value === ARENA_UI_WINDOW_IDS.lootFeed ||
      value === ARENA_UI_WINDOW_IDS.equipmentCharacter;
  }

  private getMinimizedHeight(): number {
    return 34;
  }
}
