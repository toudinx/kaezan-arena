import { Component, EventEmitter, Input, Output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HomeBackgroundDef, HomeKaelisDef } from '../../../../content/home';

type HomeCustomizeTab = 'backgrounds' | 'kaelis';

@Component({
  selector: 'app-home-customize-panel',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './home-customize-panel.component.html',
  styleUrls: ['./home-customize-panel.component.scss']
})
export class HomeCustomizePanelComponent {
  @Input() open = false;
  @Input() backgrounds: HomeBackgroundDef[] = [];
  @Input() kaelisOptions: HomeKaelisDef[] = [];
  @Input() selectedBackgroundId?: string;
  @Input() selectedKaelisId?: string;
  @Output() closed = new EventEmitter<void>();
  @Output() backgroundSelected = new EventEmitter<string>();
  @Output() kaelisSelected = new EventEmitter<string>();

  protected readonly activeTab = signal<HomeCustomizeTab>('backgrounds');

  setTab(tab: HomeCustomizeTab): void {
    this.activeTab.set(tab);
  }

  selectBackground(id: string): void {
    this.backgroundSelected.emit(id);
  }

  selectKaelis(id: string): void {
    this.kaelisSelected.emit(id);
  }

  backgroundPreview(def: HomeBackgroundDef): string {
    return def.imageUrl ? `url('${def.imageUrl}')` : 'none';
  }

  kaelisPreview(def: HomeKaelisDef): string {
    return def.imageUrl ? `url('${def.imageUrl}')` : 'none';
  }
}
