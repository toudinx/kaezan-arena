import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-home-character-stage',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule],
  templateUrl: './home-character-stage.component.html',
  styleUrl: './home-character-stage.component.css'
})
export class HomeCharacterStageComponent {
  @Input() imageUrl?: string | null;
  @Input() characterName = '';
  @Input() offsetX = 0;
  @Input() offsetY = 0;
  @Input() scale = 1;
}
