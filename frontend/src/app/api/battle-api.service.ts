import { Injectable } from "@angular/core";
import type { components } from "./generated";

export type StartBattleRequest = components["schemas"]["BattleStartRequestDto"];
export type StartBattleResponse = components["schemas"]["BattleStartResponseDto"];
export type StepBattleRequest = components["schemas"]["BattleStepRequestDto"];
export type StepBattleResponse = components["schemas"]["BattleStepResponseDto"];
export type ChooseCardRequest = {
  battleId: string;
  choiceId: string;
  selectedCardId: string;
};
export type ChooseCardResponse = StepBattleResponse;

@Injectable({ providedIn: "root" })
export class BattleApiService {
  async startBattle(request: StartBattleRequest): Promise<StartBattleResponse> {
    return this.postJson<StartBattleRequest, StartBattleResponse>(
      "/api/v1/battle/start",
      request,
      "Battle start"
    );
  }

  async stepBattle(request: StepBattleRequest): Promise<StepBattleResponse> {
    return this.postJson<StepBattleRequest, StepBattleResponse>(
      "/api/v1/battle/step",
      request,
      "Battle step"
    );
  }

  async chooseCard(request: ChooseCardRequest): Promise<ChooseCardResponse> {
    return this.postJson<ChooseCardRequest, ChooseCardResponse>(
      "/api/v1/battle/choose-card",
      request,
      "Choose card"
    );
  }

  private async postJson<TRequest, TResponse>(
    url: string,
    payload: TRequest,
    operationName: string
  ): Promise<TResponse> {
    let response: Response;
    try {
      response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json"
        },
        body: JSON.stringify(payload)
      });
    } catch (error) {
      throw new Error(`${operationName} failed: url=${url}; networkError=${this.stringifyError(error)}`);
    }

    const contentType = response.headers.get("content-type") ?? "unknown";
    const responseBody = await response.text();
    const bodyPreview = responseBody.slice(0, 200);

    if (!response.ok) {
      throw new Error(
        `${operationName} failed: url=${url}; status=${response.status}; content-type=${contentType}; body-preview=${bodyPreview}`
      );
    }

    try {
      return JSON.parse(responseBody) as TResponse;
    } catch (error) {
      throw new Error(
        `${operationName} failed: url=${url}; status=${response.status}; content-type=${contentType}; body-preview=${bodyPreview}; parseError=${this.stringifyError(error)}`
      );
    }
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
