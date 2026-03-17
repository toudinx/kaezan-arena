using System.Net;
using System.Net.Http.Json;
using KaezanArena.Api.Battle;
using KaezanArena.Api.Contracts.Battle;
using KaezanArena.Api.Contracts.Common;

namespace KaezanArena.Api.Tests;

public sealed class BattleReplayEndpointsTests : IClassFixture<ApiTestWebApplicationFactory>
{
    private readonly HttpClient _client;

    public BattleReplayEndpointsTests(ApiTestWebApplicationFactory factory)
    {
        _client = factory.CreateClient();
    }

    [Fact]
    public async Task PostBattleReplayExport_ReturnsSeedMetadataAndCommandTimeline()
    {
        var start = await StartBattleAsync("arena-replay-export-shape", "player-replay-export-shape", 1337);
        var firstStepCommands = new[]
        {
            new BattleCommandDto("move_player", Dir: "left")
        };
        var firstStep = await StepBattleAsync(start.BattleId, start.Tick, firstStepCommands);
        var secondStep = await StepBattleAsync(start.BattleId, firstStep.Tick, []);
        _ = secondStep;

        var response = await _client.PostAsJsonAsync(
            "/api/v1/battle/replay/export",
            new BattleReplayExportRequestDto(BattleId: start.BattleId));
        var payload = await response.Content.ReadFromJsonAsync<BattleReplayDto>();

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.NotNull(payload);
        Assert.Equal("arena-replay-export-shape", payload.ArenaId);
        Assert.Equal("player-replay-export-shape", payload.PlayerId);
        Assert.Equal(start.Seed, payload.Seed);
        Assert.Equal(2, payload.Actions.Count);

        var firstAction = payload.Actions[0];
        Assert.Equal("step", firstAction.Type);
        Assert.Equal(start.Tick, firstAction.ClientTick);
        Assert.NotNull(firstAction.Commands);
        Assert.Single(firstAction.Commands);
        Assert.Equal("move_player", firstAction.Commands[0].Type);
        Assert.Equal("left", firstAction.Commands[0].Dir);

        var secondAction = payload.Actions[1];
        Assert.Equal("step", secondAction.Type);
        Assert.Equal(firstStep.Tick, secondAction.ClientTick);
        Assert.NotNull(secondAction.Commands);
        Assert.Empty(secondAction.Commands);

        var replayHash = DeterminismAudit.ComputeReplayHash(payload);
        var secondExportResponse = await _client.PostAsJsonAsync(
            "/api/v1/battle/replay/export",
            new BattleReplayExportRequestDto(BattleId: start.BattleId));
        var secondExportPayload = await secondExportResponse.Content.ReadFromJsonAsync<BattleReplayDto>();
        Assert.Equal(HttpStatusCode.OK, secondExportResponse.StatusCode);
        Assert.NotNull(secondExportPayload);
        Assert.Equal(replayHash, DeterminismAudit.ComputeReplayHash(secondExportPayload));
    }

    [Fact]
    public async Task PostBattleReplayImport_ValidatesActionShape()
    {
        var missingSelectedCardResponse = await _client.PostAsJsonAsync(
            "/api/v1/battle/replay/import",
            new BattleReplayImportRequestDto(
                new BattleReplayDto(
                    ArenaId: "arena-replay-validate-shape",
                    PlayerId: "player-replay-validate-shape",
                    Seed: 1010,
                    Actions:
                    [
                        new BattleReplayActionDto(
                            Type: "choose_card",
                            ChoiceId: "choice-001")
                    ])));
        var missingSelectedCardPayload = await missingSelectedCardResponse.Content.ReadFromJsonAsync<ApiErrorDto>();

        Assert.Equal(HttpStatusCode.BadRequest, missingSelectedCardResponse.StatusCode);
        Assert.NotNull(missingSelectedCardPayload);
        Assert.Equal("validation_error", missingSelectedCardPayload.Code);
        Assert.Contains("selectedCardId is required", missingSelectedCardPayload.Message, StringComparison.Ordinal);

        var unsupportedTypeResponse = await _client.PostAsJsonAsync(
            "/api/v1/battle/replay/import",
            new BattleReplayImportRequestDto(
                new BattleReplayDto(
                    ArenaId: "arena-replay-validate-shape",
                    PlayerId: "player-replay-validate-shape",
                    Seed: 1010,
                    Actions:
                    [
                        new BattleReplayActionDto(Type: "spin")
                    ])));
        var unsupportedTypePayload = await unsupportedTypeResponse.Content.ReadFromJsonAsync<ApiErrorDto>();

        Assert.Equal(HttpStatusCode.BadRequest, unsupportedTypeResponse.StatusCode);
        Assert.NotNull(unsupportedTypePayload);
        Assert.Equal("validation_error", unsupportedTypePayload.Code);
        Assert.Contains("not supported", unsupportedTypePayload.Message, StringComparison.Ordinal);
    }

    [Fact]
    public async Task PostBattleReplayImport_ReplaysExportedTimelineToDeterministicOutcome()
    {
        var start = await StartBattleAsync("arena-replay-roundtrip", "player-replay-roundtrip", 4242);
        var latestStep = await StepBattleAsync(start.BattleId, start.Tick, BuildReplayScriptCommands(0));
        latestStep = await ChoosePendingCardIfAwaitingAsync(start.BattleId, latestStep);
        var currentTick = latestStep.Tick;

        for (var stepIndex = 1; stepIndex < 120; stepIndex += 1)
        {
            latestStep = await StepBattleAsync(start.BattleId, currentTick, BuildReplayScriptCommands(stepIndex));
            latestStep = await ChoosePendingCardIfAwaitingAsync(start.BattleId, latestStep);
            currentTick = latestStep.Tick;
            if (latestStep.IsRunEnded)
            {
                break;
            }
        }

        var exportResponse = await _client.PostAsJsonAsync(
            "/api/v1/battle/replay/export",
            new BattleReplayExportRequestDto(BattleId: start.BattleId));
        var replay = await exportResponse.Content.ReadFromJsonAsync<BattleReplayDto>();
        Assert.Equal(HttpStatusCode.OK, exportResponse.StatusCode);
        Assert.NotNull(replay);
        Assert.NotEmpty(replay.Actions);
        var replayHash = DeterminismAudit.ComputeReplayHash(replay);

        var importResponse = await _client.PostAsJsonAsync(
            "/api/v1/battle/replay/import",
            new BattleReplayImportRequestDto(replay));
        var importedFinal = await importResponse.Content.ReadFromJsonAsync<BattleStepResponseDto>();

        Assert.Equal(HttpStatusCode.OK, importResponse.StatusCode);
        Assert.NotNull(importedFinal);
        AssertReplayOutcomeEquivalent(latestStep, importedFinal);
        Assert.False(string.IsNullOrWhiteSpace(replayHash));
    }

    private async Task<BattleStartResponseDto> StartBattleAsync(
        string arenaId,
        string playerId,
        int seed)
    {
        var response = await _client.PostAsJsonAsync(
            "/api/v1/battle/start",
            new BattleStartRequestDto(
                ArenaId: arenaId,
                PlayerId: playerId,
                Seed: seed));
        var payload = await response.Content.ReadFromJsonAsync<BattleStartResponseDto>();

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.NotNull(payload);
        return payload;
    }

    private async Task<BattleStepResponseDto> StepBattleAsync(
        string battleId,
        int tick,
        IReadOnlyList<BattleCommandDto> commands)
    {
        var response = await _client.PostAsJsonAsync(
            "/api/v1/battle/step",
            new BattleStepRequestDto(
                BattleId: battleId,
                ClientTick: tick,
                Commands: commands));
        var payload = await response.Content.ReadFromJsonAsync<BattleStepResponseDto>();

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.NotNull(payload);
        return payload;
    }

    private async Task<BattleStepResponseDto> ChooseCardAsync(
        string battleId,
        string choiceId,
        string selectedCardId)
    {
        var response = await _client.PostAsJsonAsync(
            "/api/v1/battle/choose-card",
            new ChooseCardRequestDto(
                BattleId: battleId,
                ChoiceId: choiceId,
                SelectedCardId: selectedCardId));
        var payload = await response.Content.ReadFromJsonAsync<BattleStepResponseDto>();

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.NotNull(payload);
        return payload;
    }

    private async Task<BattleStepResponseDto> ChoosePendingCardIfAwaitingAsync(
        string battleId,
        BattleStepResponseDto step)
    {
        if (!step.IsAwaitingCardChoice)
        {
            return step;
        }

        Assert.False(string.IsNullOrWhiteSpace(step.PendingChoiceId));
        Assert.NotEmpty(step.OfferedCards);
        return await ChooseCardAsync(battleId, step.PendingChoiceId!, step.OfferedCards[0].Id);
    }

    private static IReadOnlyList<BattleCommandDto> BuildReplayScriptCommands(int stepIndex)
    {
        return (stepIndex % 5) switch
        {
            0 => [new BattleCommandDto("cast_skill", SkillId: ArenaConfig.ExoriSkillId)],
            1 => [new BattleCommandDto("move_player", Dir: "right")],
            2 => [new BattleCommandDto("set_facing", Dir: "down_left")],
            3 => [new BattleCommandDto("cast_skill", SkillId: ArenaConfig.ExoriMinSkillId)],
            _ => []
        };
    }

    private static void AssertReplayOutcomeEquivalent(BattleStepResponseDto expected, BattleStepResponseDto actual)
    {
        Assert.Equal(expected.Tick, actual.Tick);
        Assert.Equal(expected.Seed, actual.Seed);
        Assert.Equal(expected.BattleStatus, actual.BattleStatus);
        Assert.Equal(expected.IsRunEnded, actual.IsRunEnded);
        Assert.Equal(expected.RunEndReason, actual.RunEndReason);
        Assert.Equal(expected.RunLevel, actual.RunLevel);
        Assert.Equal(expected.RunXp, actual.RunXp);
        Assert.Equal(expected.XpToNextLevel, actual.XpToNextLevel);
        Assert.Equal(expected.TotalKills, actual.TotalKills);
        Assert.Equal(expected.EliteKills, actual.EliteKills);
        Assert.Equal(expected.ChestsOpened, actual.ChestsOpened);
        Assert.Equal(expected.IsAwaitingCardChoice, actual.IsAwaitingCardChoice);
        Assert.Equal(expected.PendingChoiceId, actual.PendingChoiceId);
        Assert.Equal(DeterminismAudit.ComputeStepHash(expected), DeterminismAudit.ComputeStepHash(actual));
    }
}
