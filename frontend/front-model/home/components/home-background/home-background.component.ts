import { Component, HostBinding, HostListener, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HomeBackgroundDef } from '../../../../content/home';

@Component({
  selector: 'app-home-background',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './home-background.component.html',
  styleUrls: ['./home-background.component.scss']
})
export class HomeBackgroundComponent {
  @Input() background?: HomeBackgroundDef | null;

  @HostBinding('style.--parallax-x') parallaxX = '0px';
  @HostBinding('style.--parallax-y') parallaxY = '0px';

  @HostListener('window:mousemove', ['$event'])
  handleMouseMove(event: MouseEvent): void {
    const strength = this.background?.parallaxStrength ?? 0;
    if (!strength) return;
    const offsetX = (event.clientX / window.innerWidth) - 0.5;
    const offsetY = (event.clientY / window.innerHeight) - 0.5;
    this.parallaxX = `${Math.round(offsetX * strength)}px`;
    this.parallaxY = `${Math.round(offsetY * strength)}px`;
  }

  @HostListener('window:mouseleave')
  handleMouseLeave(): void {
    this.parallaxX = '0px';
    this.parallaxY = '0px';
  }

  get backgroundImage(): string {
    return this.background?.imageUrl ? `url('${this.background.imageUrl}')` : 'none';
  }

  get overlayStyle(): string | null {
    return this.background?.gradientOverlay ?? null;
  }

  get particlePreset(): string {
    return this.background?.particlePreset ?? 'void';
  }
}
