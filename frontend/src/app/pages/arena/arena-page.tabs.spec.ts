import {
  ArenaPageComponent,
  RIGHT_INFO_TAB_STORAGE_KEY
} from "./arena-page.component";

describe("ArenaPageComponent tab persistence", () => {
  beforeEach(() => {
    localStorage.removeItem(RIGHT_INFO_TAB_STORAGE_KEY);
  });

  afterEach(() => {
    localStorage.removeItem(RIGHT_INFO_TAB_STORAGE_KEY);
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

  it("loads and persists right bottom tab when using H/B/K hotkeys", () => {
    localStorage.setItem(RIGHT_INFO_TAB_STORAGE_KEY, "helper");
    const component = createComponent();

    expect(component.selectedRightInfoTab).toBe("helper");

    component.onKeyDown(new KeyboardEvent("keydown", { key: "b" }));
    expect(component.selectedRightInfoTab).toBe("bestiary");
    expect(localStorage.getItem(RIGHT_INFO_TAB_STORAGE_KEY)).toBe("bestiary");

    component.onKeyDown(new KeyboardEvent("keydown", { key: "h" }));
    expect(component.selectedRightInfoTab).toBe("helper");
    expect(localStorage.getItem(RIGHT_INFO_TAB_STORAGE_KEY)).toBe("helper");

    component.onKeyDown(new KeyboardEvent("keydown", { key: "k" }));
    expect(component.selectedRightInfoTab).toBe("status");
    expect(localStorage.getItem(RIGHT_INFO_TAB_STORAGE_KEY)).toBe("status");
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
