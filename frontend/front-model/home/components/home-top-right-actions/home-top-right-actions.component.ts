import { Component, Input } from '@angular/core';
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
  imports: [CommonModule, RouterLink],
  templateUrl: './home-top-right-actions.component.html',
  styleUrls: ['./home-top-right-actions.component.scss']
})
export class HomeTopRightActionsComponent {
  @Input() actions: HomeActionItem[] = [];
}
