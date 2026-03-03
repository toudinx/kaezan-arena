import { DOCK_LAYOUT_STORAGE_KEY, DockLayoutService } from "./dock-layout.service";

describe("DockLayoutService", () => {
  beforeEach(() => {
    localStorage.removeItem(DOCK_LAYOUT_STORAGE_KEY);
  });

  afterEach(() => {
    localStorage.removeItem(DOCK_LAYOUT_STORAGE_KEY);
  });

  it("loads defaults when there is no saved layout", () => {
    const service = new DockLayoutService();

    expect(service.modules().map((module) => module.id)).toEqual(["status", "helper", "backpack", "equipment", "loot"]);
    expect(service.modules().every((module) => module.isVisible)).toBe(true);
    expect(service.modules().every((module) => !module.isCollapsed)).toBe(true);
  });

  it("persists visibility and collapsed states across reload", () => {
    const service = new DockLayoutService();
    service.hide("loot");
    service.collapse("backpack");

    const persisted = localStorage.getItem(DOCK_LAYOUT_STORAGE_KEY);
    expect(persisted).not.toBeNull();

    const rehydrated = new DockLayoutService();
    expect(rehydrated.getModule("loot")?.isVisible).toBe(false);
    expect(rehydrated.getModule("backpack")?.isCollapsed).toBe(true);
  });

  it("honors saved order and toggles visibility", () => {
    localStorage.setItem(
      DOCK_LAYOUT_STORAGE_KEY,
      JSON.stringify([
        { id: "loot", isVisible: true, isCollapsed: false, order: 0 },
        { id: "status", isVisible: true, isCollapsed: false, order: 1 },
        { id: "helper", isVisible: true, isCollapsed: false, order: 2 },
        { id: "backpack", isVisible: true, isCollapsed: false, order: 3 },
        { id: "equipment", isVisible: true, isCollapsed: false, order: 4 }
      ])
    );

    const service = new DockLayoutService();
    expect(service.modules().map((module) => module.id)).toEqual(["loot", "status", "helper", "backpack", "equipment"]);

    service.toggle("status");
    expect(service.getModule("status")?.isVisible).toBe(false);
    service.toggle("status");
    expect(service.getModule("status")?.isVisible).toBe(true);
  });

  it("persists helper module visibility toggles", () => {
    const service = new DockLayoutService();
    service.toggle("helper");
    expect(service.getModule("helper")?.isVisible).toBe(false);

    const rehydrated = new DockLayoutService();
    expect(rehydrated.getModule("helper")?.isVisible).toBe(false);

    rehydrated.toggle("helper");
    expect(rehydrated.getModule("helper")?.isVisible).toBe(true);
  });
});
