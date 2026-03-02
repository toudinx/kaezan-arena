import { CommonModule } from "@angular/common";
import { ChangeDetectionStrategy, Component, Input, OnChanges, OnInit, SimpleChanges } from "@angular/core";
import { AssetResolverService } from "../assets/asset-resolver.service";

@Component({
  selector: "app-cooldown",
  standalone: true,
  imports: [CommonModule],
  templateUrl: "./cooldown.component.html",
  styleUrl: "./cooldown.component.css",
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class CooldownComponent implements OnInit, OnChanges {
  @Input() remaining = 0;
  @Input() total = 1000;
  @Input() frameId = "cooldown";

  frameUrl = "";

  constructor(private readonly resolver: AssetResolverService) {}

  get percentReady(): number {
    if (this.total <= 0) {
      return 100;
    }

    const ready = 1 - this.remaining / this.total;
    return Math.max(0, Math.min(100, ready * 100));
  }

  ngOnInit(): void {
    void this.updateFrameUrl();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes["frameId"]) {
      void this.updateFrameUrl();
    }
  }

  private async updateFrameUrl(): Promise<void> {
    await this.resolver.loadManifest();
    this.frameUrl = this.resolver.getUiFrame(this.frameId).url;
  }
}

