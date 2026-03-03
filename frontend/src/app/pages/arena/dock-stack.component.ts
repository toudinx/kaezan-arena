import { CommonModule } from "@angular/common";
import { Component, EventEmitter, Input, Output, TemplateRef } from "@angular/core";
import type { DockModuleId, DockModuleState } from "./dock-layout.service";

@Component({
  selector: "app-dock-stack",
  standalone: true,
  imports: [CommonModule],
  templateUrl: "./dock-stack.component.html",
  styleUrl: "./dock-stack.component.css"
})
export class DockStackComponent {
  @Input() modules: ReadonlyArray<DockModuleState> = [];
  @Input() moduleTemplates: Readonly<Partial<Record<DockModuleId, TemplateRef<unknown>>>> = {};

  @Output() readonly collapseToggleRequested = new EventEmitter<DockModuleId>();
  @Output() readonly hideRequested = new EventEmitter<DockModuleId>();

  trackModuleById(_index: number, module: DockModuleState): DockModuleId {
    return module.id;
  }

  resolveTemplate(id: DockModuleId): TemplateRef<unknown> | null {
    return this.moduleTemplates[id] ?? null;
  }

  onCollapseToggle(id: DockModuleId): void {
    this.collapseToggleRequested.emit(id);
  }

  onHide(id: DockModuleId): void {
    this.hideRequested.emit(id);
  }
}
