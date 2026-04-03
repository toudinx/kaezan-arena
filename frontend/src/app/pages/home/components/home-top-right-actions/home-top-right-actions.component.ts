import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';

export interface HomeActionItem {
  id: string;
  label: string;
  iconPath: string;
  route?: string;
  tone?: 'gold' | 'standard';
}

@Component({
  selector: 'app-home-top-right-actions',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, RouterLink],
  templateUrl: './home-top-right-actions.component.html',
  styleUrl: './home-top-right-actions.component.css'
})
export class HomeTopRightActionsComponent {
  @Input() actions: HomeActionItem[] = [];
}
