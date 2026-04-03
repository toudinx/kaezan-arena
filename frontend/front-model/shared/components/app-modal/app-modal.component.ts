import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AppButtonComponent } from '../app-button/app-button.component';

@Component({
  selector: 'app-modal',
  standalone: true,
  imports: [CommonModule, AppButtonComponent],
  template: `
    @if (open) {
      <div
        class="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 py-6 backdrop-blur"
        role="dialog"
        aria-modal="true"
      >
        <div class="w-full max-w-lg rounded-[16px] border border-white/10 bg-[#0B0B16] p-6 shadow-neon">
          <div class="mb-4 flex items-start justify-between gap-3">
            <div>
              @if (kicker) {
                <p
                  class="text-[11px] uppercase tracking-[0.22em] text-[#A4A4B5]"
                >
                  {{ kicker }}
                </p>
              }
              <h3 class="text-xl font-semibold text-white">{{ title }}</h3>
              @if (subtitle) {
                <p class="text-sm text-[#A4A4B5]">{{ subtitle }}</p>
              }
            </div>
            <button
              type="button"
              class="text-[#A4A4B5] hover:text-white"
              (click)="close()"
            >
              X
            </button>
          </div>
          <div class="space-y-3">
            <ng-content></ng-content>
          </div>
          <div class="mt-6 flex flex-wrap justify-end gap-2">
            <ng-content select="[modal-actions]"></ng-content>
            <app-button
              variant="ghost"
              label="Close"
              (click)="close()"
            ></app-button>
          </div>
        </div>
      </div>
    }
  `
})
export class AppModalComponent {
  @Input() open = false;
  @Input() title = '';
  @Input() subtitle?: string;
  @Input() kicker?: string;
  @Output() closed = new EventEmitter<void>();

  close(): void {
    this.closed.emit();
  }
}
