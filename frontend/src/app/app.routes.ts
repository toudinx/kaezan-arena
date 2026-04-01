import { Routes } from '@angular/router';
import { ArenaPageComponent } from './pages/arena/arena-page.component';
import { CharactersPageComponent } from './pages/characters/characters-page.component';
import { HomePageComponent } from './pages/home/home-page.component';
import { AppShellComponent } from './shell/app-shell.component';

export const routes: Routes = [
  {
    path: 'arena',
    component: ArenaPageComponent
  },
  {
    path: '',
    component: AppShellComponent,
    children: [
      {
        path: '',
        component: HomePageComponent
      },
      {
        path: 'characters',
        component: CharactersPageComponent
      },
      {
        path: 'characters/:id',
        component: CharactersPageComponent
      },
      {
        path: 'bestiary',
        redirectTo: 'characters'
      }
    ]
  },
  {
    path: '**',
    redirectTo: ''
  }
];
