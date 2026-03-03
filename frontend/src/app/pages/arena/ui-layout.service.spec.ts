import { ARENA_UI_WINDOW_IDS, UI_LAYOUT_STORAGE_KEY, UiLayoutService } from "./ui-layout.service";

describe("UiLayoutService", () => {
  beforeEach(() => {
    localStorage.removeItem(UI_LAYOUT_STORAGE_KEY);
  });

  afterEach(() => {
    localStorage.removeItem(UI_LAYOUT_STORAGE_KEY);
  });

  it("bringToFront promotes a window to the highest z-index", () => {
    const service = new UiLayoutService();
    const baselineHighest = Math.max(...service.windows().map((windowState) => windowState.zIndex));

    service.bringToFront(ARENA_UI_WINDOW_IDS.backpack);

    const backpack = service.getWindow(ARENA_UI_WINDOW_IDS.backpack);
    expect(backpack).not.toBeNull();
    expect(backpack!.zIndex).toBe(baselineHighest + 1);
  });

  it("saves layout changes and reloads them from localStorage", () => {
    const service = new UiLayoutService();
    service.setPosition(ARENA_UI_WINDOW_IDS.lootFeed, 123, 222);
    service.close(ARENA_UI_WINDOW_IDS.lootFeed);

    const storedRaw = localStorage.getItem(UI_LAYOUT_STORAGE_KEY);
    expect(storedRaw).not.toBeNull();
    const stored = JSON.parse(storedRaw as string) as Array<Record<string, unknown>>;
    const lootEntry = stored.find((entry) => entry["id"] === ARENA_UI_WINDOW_IDS.lootFeed);
    expect(lootEntry).toBeDefined();
    expect(lootEntry!["x"]).toBe(123);
    expect(lootEntry!["y"]).toBe(222);
    expect(lootEntry!["isOpen"]).toBe(false);

    const rehydrated = new UiLayoutService();
    const lootWindow = rehydrated.getWindow(ARENA_UI_WINDOW_IDS.lootFeed);
    expect(lootWindow).not.toBeNull();
    expect(lootWindow!.x).toBe(123);
    expect(lootWindow!.y).toBe(222);
    expect(lootWindow!.isOpen).toBe(false);
  });
});
