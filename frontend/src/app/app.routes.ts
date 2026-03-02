import { Routes } from '@angular/router';
import { ArenaPageComponent } from './pages/arena/arena-page.component';
import { HomePageComponent } from './pages/home/home-page.component';

export const routes: Routes = [
  {
    path: '',
    component: HomePageComponent
  },
  {
    path: 'arena',
    component: ArenaPageComponent
  },
  {
    path: '**',
    redirectTo: ''
  }
];
