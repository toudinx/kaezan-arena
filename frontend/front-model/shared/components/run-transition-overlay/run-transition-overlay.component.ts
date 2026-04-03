import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { UiStateService } from '../../../core/services/ui-state.service';

@Component({
  selector: 'app-run-transition-overlay',
  standalone: true,
  imports: [CommonModule],
  template: `
    @if (ui.state().transitioning) {
      <div
        class="pointer-events-none fixed inset-0 z-40 flex items-center justify-center bg-black/70 backdrop-blur-sm transition-opacity duration-300"
      >
        <div class="rounded-[14px] border border-white/10 bg-white/5 px-6 py-4 text-center text-sm text-white shadow-neon">
          {{ ui.state().transitionMessage || 'Loading room...' }}
        </div>
      </div>
    }
  `
})
export class RunTransitionOverlayComponent {
  protected readonly ui = inject(UiStateService);
}
