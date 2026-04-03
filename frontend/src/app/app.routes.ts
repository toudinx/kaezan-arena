import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: 'arena',
    loadComponent: () =>
      import('./pages/arena/arena-page.component').then(m => m.ArenaPageComponent)
  },
  {
    path: '',
    loadComponent: () =>
      import('./shell/app-shell.component').then(m => m.AppShellComponent),
    children: [
      {
        path: '',
        loadComponent: () =>
          import('./pages/home/home-page.component').then(m => m.HomePageComponent)
      },
      {
        path: 'kaelis',
        loadComponent: () =>
          import('./pages/characters/characters-page.component').then(m => m.CharactersPageComponent)
      },
      {
        path: 'kaelis/:id',
        loadComponent: () =>
          import('./pages/characters/characters-page.component').then(m => m.CharactersPageComponent)
      },
      {
        path: 'arena-prep',
        loadComponent: () =>
          import('./pages/arena-prep/arena-prep-page.component').then(m => m.ArenaPrepPageComponent)
      },
      {
        path: 'backpack',
        loadComponent: () =>
          import('./pages/backpack/backpack-page.component').then(m => m.BackpackPageComponent)
      },
      {
        path: 'recruit',
        loadComponent: () =>
          import('./pages/recruit/recruit-page.component').then(m => m.RecruitPageComponent)
      },
      {
        path: 'characters',
        redirectTo: 'kaelis',
        pathMatch: 'full'
      },
      {
        path: 'characters/:id',
        redirectTo: 'kaelis/:id',
        pathMatch: 'full'
      },
      {
        path: 'home',
        redirectTo: '',
        pathMatch: 'full'
      },
      {
        path: 'bestiary',
        redirectTo: 'kaelis',
        pathMatch: 'full'
      }
    ]
  },
  {
    path: '**',
    redirectTo: ''
  }
];
