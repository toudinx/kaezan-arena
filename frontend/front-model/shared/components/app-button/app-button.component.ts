import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

@Component({
  selector: 'app-button',
  standalone: true,
  imports: [CommonModule],
  template: `
    <button
      type="button"
      [disabled]="disabled || loading"
      class="inline-flex w-full items-center justify-center gap-2 rounded-[12px] border px-4 py-3 text-sm font-semibold tracking-wide transition duration-150"
      [ngClass]="buttonClasses"
      [attr.aria-busy]="loading"
    >
      @if (loading) {
        <span class="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white"></span>
      }
      @if (icon && !loading) {
        <span class="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-lg text-white/90">
          {{ icon }}
        </span>
      }
      @if (label) {
        {{ label }}
      } @else {
        <ng-content></ng-content>
      }
    </button>
  `
})
export class AppButtonComponent {
  @Input() label?: string;
  @Input() icon?: string;
  @Input() variant: ButtonVariant = 'primary';
  @Input() disabled = false;
  @Input() loading = false;

  get buttonClasses(): Record<string, boolean> {
    return {
      'bg-[var(--primary)] text-black border-transparent shadow-neon hover:bg-[#9c8eff]': this.variant === 'primary' && !this.disabled && !this.loading,
      'bg-[var(--primary)]/60 text-black border-transparent shadow-neon': this.variant === 'primary' && (this.disabled || this.loading),
      'bg-transparent text-[var(--primary)] border-[var(--primary)]/50 hover:bg-[var(--primary)]/10': this.variant === 'secondary',
      'bg-white/5 text-white border-white/10 hover:border-white/30': this.variant === 'ghost',
      'bg-[#FF5A78]/90 text-black border-transparent hover:bg-[#ff6b86]': this.variant === 'danger',
      'opacity-60 cursor-not-allowed': this.disabled
    };
  }
}
