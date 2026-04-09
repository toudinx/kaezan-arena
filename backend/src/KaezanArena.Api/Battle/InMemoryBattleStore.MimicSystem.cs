using KaezanArena.Api.Contracts.Battle;

namespace KaezanArena.Api.Battle;

public sealed partial class InMemoryBattleStore
{
    private static void TickMimicCombat(StoredBattle state, List<BattleEventDto> events)
    {
        var mimic = state.Actors.Values.FirstOrDefault(actor =>
            actor.IsMimic && actor.Hp > 0);
        if (mimic is null)
        {
            return;
        }

        var player = GetPlayerActor(state);
        if (player is null)
        {
            return;
        }

        state.MimicAttackCooldownRemainingMs = Math.Max(0, state.MimicAttackCooldownRemainingMs - StepDeltaMs);
        if (state.MimicAttackCooldownRemainingMs > 0)
        {
            return;
        }

        var dist = ComputeChebyshevDistance(mimic.TileX, mimic.TileY, player.TileX, player.TileY);
        if (dist > 1)
        {
            return;
        }

        EmitAttackFx(
            state,
            events,
            CombatFxKind.MeleeSwing,
            fromActor: mimic,
            toActor: player,
            elementType: ElementType.Physical,
            durationMs: ArenaConfig.MeleeSwingDurationMs);

        events.Add(new FxSpawnEventDto(
            FxId: ArenaConfig.HitSmallFxId,
            TileX: player.TileX,
            TileY: player.TileY,
            Layer: "hitFx",
            DurationMs: 620,
            Element: ElementType.Physical));

        ApplyDamageToPlayer(
            state,
            events,
            player,
            ResolveMobOutgoingDamage(state, mimic, ArenaConfig.MimicConfig.AutoAttackDamage),
            ElementType.Physical,
            attacker: mimic,
            isRangedAutoAttack: false);

        state.MimicAttackCooldownRemainingMs = ArenaConfig.MimicConfig.AutoAttackCooldownMs;
    }
}
