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

    public BattleV1Controller(IBattleStore battleStore)
    {
        _battleStore = battleStore;
    }

    [HttpPost("start")]
    public ActionResult<BattleStartResponseDto> Start([FromBody] BattleStartRequestDto request)
    {
        var snapshot = _battleStore.StartBattle(request.ArenaId, request.PlayerId, request.Seed);
        return Ok(ToStartResponse(snapshot));
    }

    [HttpPost("step")]
    public ActionResult<BattleStepResponseDto> Step([FromBody] BattleStepRequestDto request)
    {
        var snapshot = _battleStore.StepBattle(request.BattleId, request.ClientTick, request.Commands);
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

    private static BattleStartResponseDto ToStartResponse(BattleSnapshot snapshot)
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
            SelectedCards: snapshot.SelectedCards);
    }

    private static BattleStepResponseDto ToStepResponse(BattleSnapshot snapshot)
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
            CommandResults: snapshot.CommandResults);
    }

    private ApiErrorDto BuildValidationError(string message)
    {
        return new ApiErrorDto(
            Code: "validation_error",
            Message: message,
            TraceId: HttpContext.TraceIdentifier);
    }
}
