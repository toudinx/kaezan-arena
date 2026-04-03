import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HomeKaelisDef } from '../../../../content/home';

@Component({
  selector: 'app-home-character-stage',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './home-character-stage.component.html',
  styleUrls: ['./home-character-stage.component.scss']
})
export class HomeCharacterStageComponent {
  @Input() kaelis?: HomeKaelisDef | null;

  get characterImage(): string {
    return this.kaelis?.imageUrl ? `url('${this.kaelis.imageUrl}')` : 'none';
  }
}
