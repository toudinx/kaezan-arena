import { ArenaPageComponent } from "./arena-page.component";

describe("ArenaPageComponent loot console interactions", () => {
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

  it("focuses backpack and dispatches highlight when a loot item link is clicked", () => {
    const component = createComponent();
    const focusBackpackSpy = vi.spyOn(component as any, "focusBackpackPanel");

    component.onLootConsoleItemClicked("scrap_iron");

    expect(focusBackpackSpy).toHaveBeenCalledTimes(1);
    expect((component as unknown as { backpackHighlightItemId: string | null }).backpackHighlightItemId).toBe("scrap_iron");
    expect((component as unknown as { backpackHighlightRequestId: number }).backpackHighlightRequestId).toBe(1);
  });
});
