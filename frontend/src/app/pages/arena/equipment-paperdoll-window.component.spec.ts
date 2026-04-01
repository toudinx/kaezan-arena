import { TestBed } from "@angular/core/testing";
import { EquipmentPaperdollWindowComponent } from "./equipment-paperdoll-window.component";

describe("EquipmentPaperdollWindowComponent", () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [EquipmentPaperdollWindowComponent]
    }).compileComponents();
  });

  it("renders exactly 1 slot with W glyph", () => {
    const fixture = TestBed.createComponent(EquipmentPaperdollWindowComponent);
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    const slots = host.querySelectorAll(".paperdoll__slot");
    const glyphs = Array.from(host.querySelectorAll(".paperdoll__slot-glyph")).map((element) => element.textContent?.trim());

    expect(slots.length).toBe(1);
    expect(glyphs).toEqual(["W"]);
  });

  it("applies rarity class to weapon slot", () => {
    const fixture = TestBed.createComponent(EquipmentPaperdollWindowComponent);
    fixture.componentInstance.weaponRarity = "rare";
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    const slots = host.querySelectorAll(".paperdoll__slot");
    expect(slots[0]?.classList.contains("paperdoll__slot--rarity-rare")).toBe(true);
  });

  it("sets tooltip text for weapon slot", () => {
    const fixture = TestBed.createComponent(EquipmentPaperdollWindowComponent);
    fixture.componentInstance.equippedWeaponLabel = "Iron Blade";
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    const slots = host.querySelectorAll(".paperdoll__slot");
    expect(slots[0]?.getAttribute("title")).toBe("Weapon: Iron Blade");
  });
});
