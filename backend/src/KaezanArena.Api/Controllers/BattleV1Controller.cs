using KaezanArena.Api.Battle;
using KaezanArena.Api.Contracts.Battle;
using KaezanArena.Api.Contracts.Common;
using Microsoft.AspNetCore.Mvc;

namespace KaezanArena.Api.Controllers;

[ApiController]
[Route("api/v1/battle")]
public sealed class BattleV1Controller : ControllerBase
{
    private readonly IBattleStore _battleStore;
    private readonly int _stepDeltaMs;

    public BattleV1Controller(IBattleStore battleStore, IConfiguration configuration)
    {
        _battleStore = battleStore;
        _stepDeltaMs = ArenaConfig.NormalizeStepDeltaMs(configuration.GetValue<int?>("Battle:StepDeltaMs"));
    }

    [HttpPost("start")]
    public ActionResult<BattleStartResponseDto> Start([FromBody] BattleStartRequestDto request)
    {
        var resolvedSeed = request.SeedOverride ?? request.Seed;
        var snapshot = _battleStore.StartBattle(request.ArenaId, request.PlayerId, resolvedSeed);
        return Ok(ToStartResponse(snapshot));
    }

    [HttpPost("step")]
    public ActionResult<BattleStepResponseDto> Step([FromBody] BattleStepRequestDto request)
    {
        var snapshot = _battleStore.StepBattle(request.BattleId, request.ClientTick, request.Commands, request.StepCount);
        return Ok(ToStepResponse(snapshot));
    }

    [HttpPost("choose-card")]
    public ActionResult<BattleStepResponseDto> ChooseCard([FromBody] ChooseCardRequestDto request)
    {
        if (request is null)
        {
            return BadRequest(BuildValidationError("request body is required"));
        }

        if (string.IsNullOrWhiteSpace(request.BattleId))
        {
            return BadRequest(BuildValidationError("battleId is required"));
        }

        if (string.IsNullOrWhiteSpace(request.ChoiceId))
        {
            return BadRequest(BuildValidationError("choiceId is required"));
        }

        if (string.IsNullOrWhiteSpace(request.SelectedCardId))
        {
            return BadRequest(BuildValidationError("selectedCardId is required"));
        }

        try
        {
            var snapshot = _battleStore.ChooseCard(request.BattleId, request.ChoiceId, request.SelectedCardId);
            return Ok(ToStepResponse(snapshot));
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(BuildValidationError(ex.Message));
        }
        catch (ArgumentException ex)
        {
            return BadRequest(BuildValidationError(ex.Message));
        }
    }

    [HttpPost("replay/export")]
    public ActionResult<BattleReplayDto> ExportReplay([FromBody] BattleReplayExportRequestDto request)
    {
        if (request is null)
        {
            return BadRequest(BuildValidationError("request body is required"));
        }

        if (string.IsNullOrWhiteSpace(request.BattleId))
        {
            return BadRequest(BuildValidationError("battleId is required"));
        }

        if (!_battleStore.TryExportReplay(request.BattleId, out var replay))
        {
            return NotFound(BuildNotFoundError($"Battle '{request.BattleId}' was not found."));
        }

        return Ok(replay);
    }

    [HttpPost("replay/import")]
    public ActionResult<BattleStepResponseDto> ImportReplay([FromBody] BattleReplayImportRequestDto request)
    {
        if (request is null || request.Replay is null)
        {
            return BadRequest(BuildValidationError("replay is required"));
        }

        var replay = request.Replay;
        if (string.IsNullOrWhiteSpace(replay.ArenaId))
        {
            return BadRequest(BuildValidationError("replay.arenaId is required"));
        }

        if (string.IsNullOrWhiteSpace(replay.PlayerId))
        {
            return BadRequest(BuildValidationError("replay.playerId is required"));
        }

        if (replay.Actions is null)
        {
            return BadRequest(BuildValidationError("replay.actions is required"));
        }

        BattleSnapshot snapshot;
        try
        {
            snapshot = _battleStore.StartBattle(replay.ArenaId, replay.PlayerId, replay.Seed);
        }
        catch (ArgumentException ex)
        {
            return BadRequest(BuildValidationError(ex.Message));
        }

        for (var actionIndex = 0; actionIndex < replay.Actions.Count; actionIndex += 1)
        {
            var action = replay.Actions[actionIndex];
            var actionType = NormalizeReplayActionType(action.Type);
            if (string.IsNullOrWhiteSpace(actionType))
            {
                return BadRequest(BuildValidationError($"replay.actions[{actionIndex}].type is required"));
            }

            if (string.Equals(actionType, "step", StringComparison.Ordinal))
            {
                snapshot = _battleStore.StepBattle(snapshot.BattleId, action.ClientTick, action.Commands, action.StepCount);
                continue;
            }

            if (string.Equals(actionType, "choose_card", StringComparison.Ordinal))
            {
                if (string.IsNullOrWhiteSpace(action.ChoiceId))
                {
                    return BadRequest(BuildValidationError(
                        $"replay.actions[{actionIndex}].choiceId is required for choose_card actions"));
                }

                if (string.IsNullOrWhiteSpace(action.SelectedCardId))
                {
                    return BadRequest(BuildValidationError(
                        $"replay.actions[{actionIndex}].selectedCardId is required for choose_card actions"));
                }

                try
                {
                    snapshot = _battleStore.ChooseCard(snapshot.BattleId, action.ChoiceId, action.SelectedCardId);
                }
                catch (InvalidOperationException ex)
                {
                    return BadRequest(BuildValidationError(ex.Message));
                }
                catch (ArgumentException ex)
                {
                    return BadRequest(BuildValidationError(ex.Message));
                }

                continue;
            }

            return BadRequest(BuildValidationError(
                $"replay.actions[{actionIndex}].type '{actionType}' is not supported"));
        }

        return Ok(ToStepResponse(snapshot));
    }

    private BattleStartResponseDto ToStartResponse(BattleSnapshot snapshot)
    {
        return new BattleStartResponseDto(
            BattleId: snapshot.BattleId,
            Tick: snapshot.Tick,
            Actors: snapshot.Actors,
            Skills: snapshot.Skills,
            GlobalCooldownRemainingMs: snapshot.GlobalCooldownRemainingMs,
            GlobalCooldownTotalMs: snapshot.GlobalCooldownTotalMs,
            AltarCooldownRemainingMs: snapshot.AltarCooldownRemainingMs,
            Seed: snapshot.Seed,
            FacingDirection: snapshot.FacingDirection,
            BattleStatus: snapshot.BattleStatus,
            IsGameOver: snapshot.IsGameOver,
            EndReason: snapshot.EndReason,
            IsRunEnded: snapshot.IsRunEnded,
            RunEndReason: snapshot.RunEndReason,
            RunEndedAtMs: snapshot.RunEndedAtMs,
            RunXp: snapshot.RunXp,
            RunLevel: snapshot.RunLevel,
            XpToNextLevel: snapshot.XpToNextLevel,
            TotalKills: snapshot.TotalKills,
            EliteKills: snapshot.EliteKills,
            ChestsOpened: snapshot.ChestsOpened,
            TimeSurvivedMs: snapshot.TimeSurvivedMs,
            RunTimeMs: snapshot.RunTimeMs,
            RunDurationMs: snapshot.RunDurationMs,
            StepDeltaMs: _stepDeltaMs,
            CurrentMobHpMult: snapshot.CurrentMobHpMult,
            CurrentMobDmgMult: snapshot.CurrentMobDmgMult,
            Scaling: snapshot.Scaling,
            EffectiveTargetEntityId: snapshot.EffectiveTargetEntityId,
            LockedTargetEntityId: snapshot.LockedTargetEntityId,
            GroundTargetPos: snapshot.GroundTargetPos,
            AssistConfig: snapshot.AssistConfig,
            PlayerBaseElement: snapshot.PlayerBaseElement,
            WeaponElement: snapshot.WeaponElement,
            Decals: snapshot.Decals,
            ActiveBuffs: snapshot.ActiveBuffs,
            Bestiary: snapshot.Bestiary,
            PendingSpeciesChest: snapshot.PendingSpeciesChest,
            ActivePois: snapshot.ActivePois,
            IsAwaitingCardChoice: snapshot.IsAwaitingCardChoice,
            PendingChoiceId: snapshot.PendingChoiceId,
            OfferedCards: snapshot.OfferedCards,
            SelectedCards: snapshot.SelectedCards,
            FreeSlotWeaponId: snapshot.FreeSlotWeaponId,
            FreeSlotWeaponName: snapshot.FreeSlotWeaponName);
    }

    private BattleStepResponseDto ToStepResponse(BattleSnapshot snapshot)
    {
        return new BattleStepResponseDto(
            BattleId: snapshot.BattleId,
            Tick: snapshot.Tick,
            Actors: snapshot.Actors,
            Skills: snapshot.Skills,
            GlobalCooldownRemainingMs: snapshot.GlobalCooldownRemainingMs,
            GlobalCooldownTotalMs: snapshot.GlobalCooldownTotalMs,
            AltarCooldownRemainingMs: snapshot.AltarCooldownRemainingMs,
            Seed: snapshot.Seed,
            FacingDirection: snapshot.FacingDirection,
            BattleStatus: snapshot.BattleStatus,
            IsGameOver: snapshot.IsGameOver,
            EndReason: snapshot.EndReason,
            IsRunEnded: snapshot.IsRunEnded,
            RunEndReason: snapshot.RunEndReason,
            RunEndedAtMs: snapshot.RunEndedAtMs,
            RunXp: snapshot.RunXp,
            RunLevel: snapshot.RunLevel,
            XpToNextLevel: snapshot.XpToNextLevel,
            TotalKills: snapshot.TotalKills,
            EliteKills: snapshot.EliteKills,
            ChestsOpened: snapshot.ChestsOpened,
            TimeSurvivedMs: snapshot.TimeSurvivedMs,
            RunTimeMs: snapshot.RunTimeMs,
            RunDurationMs: snapshot.RunDurationMs,
            StepDeltaMs: _stepDeltaMs,
            CurrentMobHpMult: snapshot.CurrentMobHpMult,
            CurrentMobDmgMult: snapshot.CurrentMobDmgMult,
            Scaling: snapshot.Scaling,
            EffectiveTargetEntityId: snapshot.EffectiveTargetEntityId,
            LockedTargetEntityId: snapshot.LockedTargetEntityId,
            GroundTargetPos: snapshot.GroundTargetPos,
            AssistConfig: snapshot.AssistConfig,
            PlayerBaseElement: snapshot.PlayerBaseElement,
            WeaponElement: snapshot.WeaponElement,
            Decals: snapshot.Decals,
            ActiveBuffs: snapshot.ActiveBuffs,
            Bestiary: snapshot.Bestiary,
            PendingSpeciesChest: snapshot.PendingSpeciesChest,
            ActivePois: snapshot.ActivePois,
            IsAwaitingCardChoice: snapshot.IsAwaitingCardChoice,
            PendingChoiceId: snapshot.PendingChoiceId,
            OfferedCards: snapshot.OfferedCards,
            SelectedCards: snapshot.SelectedCards,
            Events: snapshot.Events,
            CommandResults: snapshot.CommandResults,
            FreeSlotWeaponId: snapshot.FreeSlotWeaponId,
            FreeSlotWeaponName: snapshot.FreeSlotWeaponName);
    }

    private ApiErrorDto BuildValidationError(string message)
    {
        return new ApiErrorDto(
            Code: "validation_error",
            Message: message,
            TraceId: HttpContext.TraceIdentifier);
    }

    private static string NormalizeReplayActionType(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return string.Empty;
        }

        return value.Trim().ToLowerInvariant();
    }

    private ApiErrorDto BuildNotFoundError(string message)
    {
        return new ApiErrorDto(
            Code: "not_found",
            Message: message,
            TraceId: HttpContext.TraceIdentifier);
    }
}
