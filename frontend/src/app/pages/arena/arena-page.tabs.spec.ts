import {
  ArenaPageComponent,
  TOOLS_TAB_STORAGE_KEY
} from "./arena-page.component";

describe("ArenaPageComponent tools tab persistence", () => {
  beforeEach(() => {
    localStorage.removeItem(TOOLS_TAB_STORAGE_KEY);
  });

  afterEach(() => {
    localStorage.removeItem(TOOLS_TAB_STORAGE_KEY);
  });

  function createComponent(): ArenaPageComponent {
    return new ArenaPageComponent(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never
    );
  }

  it("loads and persists tools tab when using H/B hotkeys", () => {
    localStorage.setItem(TOOLS_TAB_STORAGE_KEY, "helper");
    const component = createComponent();

    expect(component.selectedToolsTab).toBe("helper");

    component.onKeyDown(new KeyboardEvent("keydown", { key: "b" }));
    expect(component.selectedToolsTab).toBe("bestiary");
    expect(localStorage.getItem(TOOLS_TAB_STORAGE_KEY)).toBe("bestiary");

    component.onKeyDown(new KeyboardEvent("keydown", { key: "h" }));
    expect(component.selectedToolsTab).toBe("helper");
    expect(localStorage.getItem(TOOLS_TAB_STORAGE_KEY)).toBe("helper");
  });

  it("uses K hotkey to focus status panel without changing tools tab", () => {
    const component = createComponent();
    component.selectedToolsTab = "helper";
    const statusFocusSpy = vi.spyOn(component as any, "focusStatusPanel");
    component.onKeyDown(new KeyboardEvent("keydown", { key: "k" }));

    expect(statusFocusSpy).toHaveBeenCalledTimes(1);
    expect(component.selectedToolsTab).toBe("helper");
  });

  it("uses I/C hotkeys to focus pinned backpack/equipment panels", () => {
    const component = createComponent();
    const backpackSpy = vi.spyOn(component as any, "focusBackpackPanel");
    const equipmentSpy = vi.spyOn(component as any, "focusEquipmentPanel");

    component.onKeyDown(new KeyboardEvent("keydown", { key: "i" }));
    component.onKeyDown(new KeyboardEvent("keydown", { key: "c" }));

    expect(backpackSpy).toHaveBeenCalledTimes(1);
    expect(equipmentSpy).toHaveBeenCalledTimes(1);
  });
});
