import { Injectable, computed, signal } from "@angular/core";

export const DOCK_LAYOUT_STORAGE_KEY = "kaezan_arena_dock_layout_v1";

export type DockModuleId = "status" | "helper" | "backpack" | "equipment" | "loot";

export type DockModuleState = Readonly<{
  id: DockModuleId;
  title: string;
  isVisible: boolean;
  isCollapsed: boolean;
  order: number;
}>;

type StoredDockModuleState = {
  id: DockModuleId;
  isVisible: boolean;
  isCollapsed: boolean;
  order: number;
};

type MutableDockModuleMap = Record<DockModuleId, DockModuleState>;

const DEFAULT_MODULES: ReadonlyArray<DockModuleState> = [
  {
    id: "status",
    title: "Status",
    isVisible: true,
    isCollapsed: false,
    order: 0
  },
  {
    id: "helper",
    title: "HELPER",
    isVisible: true,
    isCollapsed: false,
    order: 1
  },
  {
    id: "backpack",
    title: "Backpack",
    isVisible: true,
    isCollapsed: false,
    order: 2
  },
  {
    id: "equipment",
    title: "Equipment",
    isVisible: true,
    isCollapsed: false,
    order: 3
  },
  {
    id: "loot",
    title: "Loot Console",
    isVisible: true,
    isCollapsed: false,
    order: 4
  }
];

@Injectable({ providedIn: "root" })
export class DockLayoutService {
  private readonly modulesById = signal<MutableDockModuleMap>(this.loadInitialLayout());

  readonly modules = computed(() =>
    Object.values(this.modulesById()).sort((left, right) => {
      if (left.order === right.order) {
        return left.id.localeCompare(right.id);
      }

      return left.order - right.order;
    })
  );

  getModule(id: DockModuleId): DockModuleState | null {
    return this.modulesById()[id] ?? null;
  }

  toggle(id: DockModuleId): void {
    const module = this.getModule(id);
    if (!module) {
      return;
    }

    if (module.isVisible) {
      this.hide(id);
      return;
    }

    this.show(id);
  }

  show(id: DockModuleId): void {
    this.update(id, (module) => ({
      ...module,
      isVisible: true
    }));
  }

  hide(id: DockModuleId): void {
    this.update(id, (module) => ({
      ...module,
      isVisible: false
    }));
  }

  collapse(id: DockModuleId): void {
    this.update(id, (module) => ({
      ...module,
      isCollapsed: true
    }));
  }

  expand(id: DockModuleId): void {
    this.update(id, (module) => ({
      ...module,
      isCollapsed: false
    }));
  }

  private update(id: DockModuleId, updater: (module: DockModuleState) => DockModuleState): void {
    const current = this.modulesById();
    const existing = current[id];
    if (!existing) {
      return;
    }

    const next = updater(existing);
    if (
      next.id === existing.id &&
      next.title === existing.title &&
      next.isVisible === existing.isVisible &&
      next.isCollapsed === existing.isCollapsed &&
      next.order === existing.order
    ) {
      return;
    }

    this.modulesById.set({
      ...current,
      [id]: next
    });
    this.persistLayout();
  }

  private loadInitialLayout(): MutableDockModuleMap {
    const defaults = this.toModuleMap(DEFAULT_MODULES);
    const stored = this.readStoredLayout();
    if (stored.length === 0) {
      return defaults;
    }

    const merged: MutableDockModuleMap = { ...defaults };
    for (const entry of stored) {
      const base = defaults[entry.id];
      merged[entry.id] = {
        ...base,
        isVisible: entry.isVisible,
        isCollapsed: entry.isCollapsed,
        order: entry.order
      };
    }

    return this.normalizeOrder(merged);
  }

  private toModuleMap(modules: ReadonlyArray<DockModuleState>): MutableDockModuleMap {
    const result = {} as MutableDockModuleMap;
    for (const module of modules) {
      result[module.id] = module;
    }

    return result;
  }

  private normalizeOrder(modulesById: MutableDockModuleMap): MutableDockModuleMap {
    const sorted = Object.values(modulesById).sort((left, right) => {
      if (left.order === right.order) {
        return left.id.localeCompare(right.id);
      }

      return left.order - right.order;
    });

    const normalized = {} as MutableDockModuleMap;
    for (let index = 0; index < sorted.length; index += 1) {
      const module = sorted[index];
      normalized[module.id] = {
        ...module,
        order: index
      };
    }

    return normalized;
  }

  private readStoredLayout(): StoredDockModuleState[] {
    if (!this.canUseStorage()) {
      return [];
    }

    try {
      const raw = window.localStorage.getItem(DOCK_LAYOUT_STORAGE_KEY);
      if (!raw) {
        return [];
      }

      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) {
        return [];
      }

      const result: StoredDockModuleState[] = [];
      for (const value of parsed) {
        if (!value || typeof value !== "object") {
          continue;
        }

        const candidate = value as Partial<StoredDockModuleState>;
        if (!candidate.id || !this.isKnownId(candidate.id)) {
          continue;
        }

        result.push({
          id: candidate.id,
          isVisible: this.toBoolean(candidate.isVisible, true),
          isCollapsed: this.toBoolean(candidate.isCollapsed, false),
          order: this.toNumber(candidate.order, 0)
        });
      }

      return result;
    } catch {
      return [];
    }
  }

  private persistLayout(): void {
    if (!this.canUseStorage()) {
      return;
    }

    try {
      const serializable: StoredDockModuleState[] = this.modules().map((module) => ({
        id: module.id,
        isVisible: module.isVisible,
        isCollapsed: module.isCollapsed,
        order: module.order
      }));
      window.localStorage.setItem(DOCK_LAYOUT_STORAGE_KEY, JSON.stringify(serializable));
    } catch {
      // Ignore storage write failures so UI interactions are never blocked.
    }
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

  private isKnownId(value: string): value is DockModuleId {
    return value === "status" || value === "helper" || value === "backpack" || value === "equipment" || value === "loot";
  }

  private toBoolean(value: unknown, fallback: boolean): boolean {
    return typeof value === "boolean" ? value : fallback;
  }

  private toNumber(value: unknown, fallback: number): number {
    return typeof value === "number" && Number.isFinite(value) ? Math.round(value) : fallback;
  }
}
