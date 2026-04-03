import { Component } from "@angular/core";
import { NavigationEnd, Router, RouterLink, RouterOutlet } from "@angular/router";
import { filter } from "rxjs";

@Component({
  selector: "app-shell",
  standalone: true,
  imports: [RouterLink, RouterOutlet],
  templateUrl: "./app-shell.component.html",
  styleUrl: "./app-shell.component.css"
})
export class AppShellComponent {
  showTopbar = true;

  constructor(private readonly router: Router) {
    this.updateTopbarVisibility(router.url);
    this.router.events
      .pipe(filter((event): event is NavigationEnd => event instanceof NavigationEnd))
      .subscribe(event => this.updateTopbarVisibility(event.urlAfterRedirects));
  }

  private updateTopbarVisibility(url: string): void {
    const normalized = (url ?? "").toLowerCase();
    this.showTopbar = !normalized.startsWith("/arena-prep");
  }
}
