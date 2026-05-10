import { ChangeDetectionStrategy, Component } from "@angular/core";
import { Router } from "@angular/router";

@Component({
  selector: "app-arena-select-page",
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: "./arena-select-page.component.html",
  styleUrl: "./arena-select-page.component.css"
})
export class ArenaSelectPageComponent {
  constructor(private readonly router: Router) {}

  goStandard(): void {
    void this.router.navigateByUrl("/arena-prep");
  }

  goElemental(): void {
    void this.router.navigateByUrl("/arena-elemental");
  }

  goBack(): void {
    void this.router.navigateByUrl("/");
  }
}
