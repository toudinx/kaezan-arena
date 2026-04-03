import { CommonModule } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { HomeSceneStateService } from '../../core/services/home-scene-state.service';
import { getHomeBackgrounds, getHomeKaelisOptions } from '../../content/home';
import { HomeBackgroundComponent } from './components/home-background/home-background.component';
import { HomeCharacterStageComponent } from './components/home-character-stage/home-character-stage.component';
import { HomeTopLeftHudComponent } from './components/home-top-left-hud/home-top-left-hud.component';
import { HomeTopRightActionsComponent, HomeActionItem } from './components/home-top-right-actions/home-top-right-actions.component';
import { HomeMainNavigationComponent, HomeNavItem } from './components/home-main-navigation/home-main-navigation.component';
import { HomeRaidBannerComponent } from './components/home-raid-banner/home-raid-banner.component';
import { HomeCustomizePanelComponent } from './components/home-customize-panel/home-customize-panel.component';

@Component({
  selector: 'app-home-page',
  standalone: true,
  imports: [
    CommonModule,
    HomeBackgroundComponent,
    HomeCharacterStageComponent,
    HomeTopLeftHudComponent,
    HomeTopRightActionsComponent,
    HomeMainNavigationComponent,
    HomeRaidBannerComponent,
    HomeCustomizePanelComponent
  ],
  templateUrl: './home.page.html',
  styleUrls: ['./home.page.scss']
})
export class HomePageComponent {
  protected readonly homeScene = inject(HomeSceneStateService);
  private readonly router = inject(Router);

  protected readonly backgrounds = getHomeBackgrounds();
  protected readonly kaelisOptions = getHomeKaelisOptions();
  protected readonly customizeOpen = signal(false);
  protected readonly expeditionModeOpen = signal(false);

  protected readonly mainNavItems: HomeNavItem[] = [
    {
      id: 'expedition',
      title: 'Expedition',
      subtitle: 'Start Run',
      tone: 'expedition'
    },
    {
      id: 'simulation',
      title: 'Simulation',
      subtitle: 'Materials & Equipment',
      route: '/inventory',
      tone: 'simulation'
    },
    {
      id: 'kaelis',
      title: 'Kaelis',
      subtitle: 'Squad + Gear + Sigils',
      route: '/character-management',
      tone: 'kaelis'
    },
    {
      id: 'recruit',
      title: 'Recruit',
      subtitle: 'New Banner Available',
      route: '/gacha',
      tone: 'recruit'
    }
  ];

  protected readonly actionItems: HomeActionItem[] = [
    {
      id: 'shop',
      label: 'Shop',
      iconPath:
        'M7 18c-1.1 0-1.99.9-1.99 2S5.9 22 7 22s2-.9 2-2-.9-2-2-2zM1 2v2h2l3.6 7.59-1.35 2.45c-.16.28-.25.61-.25.96 0 1.1.9 2 2 2h12v-2H7.42c-.14 0-.25-.11-.25-.25l.03-.12.9-1.63h7.45c.75 0 1.41-.41 1.75-1.03l3.58-6.49c.08-.14.12-.31.12-.48 0-.55-.45-1-1-1H5.21l-.94-2H1zm16 16c-1.1 0-1.99.9-1.99 2s.9 2 1.99 2 2-.9 2-2-.9-2-2-2z',
      route: '/store',
      tone: 'gold'
    },
    {
      id: 'inbox',
      label: 'Inbox',
      iconPath:
        'M20 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z',
      route: '/events'
    },
    {
      id: 'calendar',
      label: 'Calendar',
      iconPath:
        'M19 3h-1V1h-2v2H8V1H6v2H5c-1.11 0-1.99.9-1.99 2L3 19a2 2 0 0 0 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V8h14v11z',
      route: '/daily'
    },
    {
      id: 'settings',
      label: 'Settings',
      iconPath:
        'M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58a.49.49 0 0 0 .12-.61l-1.92-3.32a.488.488 0 0 0-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.484.484 0 0 0-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58a.49.49 0 0 0-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z',
      route: '/collection'
    }
  ];

  openCustomize(): void {
    this.customizeOpen.set(true);
  }

  closeCustomize(): void {
    this.customizeOpen.set(false);
  }

  openExpeditionMode(): void {
    this.expeditionModeOpen.set(true);
  }

  closeExpeditionMode(): void {
    this.expeditionModeOpen.set(false);
  }

  handleMainNavSelection(item: HomeNavItem): void {
    if (item.id === 'expedition') {
      this.openExpeditionMode();
    }
  }

  startMvpRun(): void {
    this.closeExpeditionMode();
    this.router.navigateByUrl('/run/start');
  }

  startAscensionRun(): void {
    this.closeExpeditionMode();
    this.router.navigateByUrl('/ascension/start');
  }

  selectBackground(id: string): void {
    this.homeScene.setBackground(id);
  }

  selectKaelis(id: string): void {
    this.homeScene.setKaelis(id);
  }
}
