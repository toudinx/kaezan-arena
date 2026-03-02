import { Injectable } from "@angular/core";
import { apiClient } from "./generated";
import type { components } from "./generated";

export type AoePlanRequest = components["schemas"]["AoePlanRequestDto"];
export type AoePlanResponse = components["schemas"]["AoePlanResponseDto"];

@Injectable({ providedIn: "root" })
export class EffectsApiService {
  async planAoeFx(request: AoePlanRequest): Promise<AoePlanResponse> {
    const { data, error } = await apiClient.POST("/api/v1/effects/aoe-plan", {
      body: request
    });

    if (error || !data) {
      throw new Error(`AoE plan failed: ${this.stringifyError(error)}`);
    }

    return data;
  }

  private stringifyError(error: unknown): string {
    if (!error) {
      return "unknown error";
    }

    try {
      return JSON.stringify(error);
    } catch {
      return String(error);
    }
  }
}
