import { ChangeDetectionStrategy, Component } from "@angular/core";
import { RouterLink } from "@angular/router";

@Component({
  selector: "app-arena-select-page",
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  templateUrl: "./arena-select-page.component.html",
  styleUrl: "./arena-select-page.component.css"
})
export class ArenaSelectPageComponent {}
