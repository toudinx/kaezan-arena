using KaezanArena.Api.Battle;
using KaezanArena.Api.Contracts.Battle;
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

        return Ok(new BattleStartResponseDto(
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
            RunXp: snapshot.RunXp,
            RunLevel: snapshot.RunLevel,
            XpToNextLevel: snapshot.XpToNextLevel,
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
            ActivePois: snapshot.ActivePois));
    }

    [HttpPost("step")]
    public ActionResult<BattleStepResponseDto> Step([FromBody] BattleStepRequestDto request)
    {
        var snapshot = _battleStore.StepBattle(request.BattleId, request.ClientTick, request.Commands);

        return Ok(new BattleStepResponseDto(
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
            RunXp: snapshot.RunXp,
            RunLevel: snapshot.RunLevel,
            XpToNextLevel: snapshot.XpToNextLevel,
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
            Events: snapshot.Events,
            CommandResults: snapshot.CommandResults));
    }
}
