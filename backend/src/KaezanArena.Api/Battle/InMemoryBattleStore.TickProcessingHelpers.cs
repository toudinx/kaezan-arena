using KaezanArena.Api.Contracts.Battle;

namespace KaezanArena.Api.Battle;

public sealed partial class InMemoryBattleStore
{
    private static void TickSkillCooldowns(StoredBattle state)
    {
        foreach (var skill in state.Skills.Values)
        {
            skill.CooldownRemainingMs = Math.Max(0, skill.CooldownRemainingMs - StepDeltaMs);
        }
    }

    private static void TickPlayerAutoAttackCooldown(StoredBattle state)
    {
        state.PlayerAttackCooldownRemainingMs = Math.Max(0, state.PlayerAttackCooldownRemainingMs - StepDeltaMs);
    }

    private static void TickPlayerGlobalCooldown(StoredBattle state)
    {
        state.PlayerGlobalCooldownRemainingMs = Math.Max(0, state.PlayerGlobalCooldownRemainingMs - StepDeltaMs);
    }

    private static void TickMobCombatCooldowns(StoredBattle state)
    {
        foreach (var slot in state.MobSlots.Values)
        {
            slot.AttackCooldownRemainingMs = Math.Max(0, slot.AttackCooldownRemainingMs - StepDeltaMs);
            slot.AbilityCooldownRemainingMs = Math.Max(0, slot.AbilityCooldownRemainingMs - StepDeltaMs);
        }
    }

    private static void TickMobMovement(StoredBattle state)
    {
        var player = GetPlayerActor(state);
        if (player is null)
        {
            return;
        }

        var mobs = state.Actors.Values
            .Where(actor => actor.Kind == "mob")
            .OrderBy(actor => actor.ActorId, StringComparer.Ordinal)
            .ToList();

        foreach (var mob in mobs)
        {
            if (!state.Actors.TryGetValue(mob.ActorId, out var liveMob))
            {
                continue;
            }

            if (liveMob.MobSlotIndex is not int slotIndex || !state.MobSlots.TryGetValue(slotIndex, out var slot))
            {
                continue;
            }

            var config = GetMobConfig(slot.Archetype);
            slot.MoveCooldownRemainingMs -= StepDeltaMs;
            while (slot.MoveCooldownRemainingMs <= 0)
            {
                slot.MoveCooldownRemainingMs += config.MoveCooldownMs;
                if (slot.MoveCooldownRemainingMs <= 0)
                {
                    slot.MoveCooldownRemainingMs = config.MoveCooldownMs;
                }

                var behavior = GetMobBehavior(slot.Archetype);
                if (!behavior.TryChooseMove(state, liveMob, player, slot, config, out var destination))
                {
                    break;
                }

                if (!TryMoveMobToTile(state, liveMob, destination))
                {
                    break;
                }
            }
        }
    }

    private static void TickMobCommitWindows(StoredBattle state)
    {
        foreach (var slot in state.MobSlots.Values)
        {
            slot.CommitTicksRemaining = Math.Max(0, slot.CommitTicksRemaining - 1);
        }
    }

    private static void TickMobRespawns(StoredBattle state, List<BattleEventDto> events)
    {
        var maxAliveMobs = ResolveSpawnPacingDirector(state).MaxAliveMobs;
        foreach (var slot in state.MobSlots.Values.OrderBy(value => value.SlotIndex))
        {
            if (slot.SlotIndex > maxAliveMobs)
            {
                slot.RespawnRemainingMs = 0;
                continue;
            }

            if (state.Actors.ContainsKey(slot.ActorId))
            {
                slot.RespawnRemainingMs = 0;
                continue;
            }

            if (slot.RespawnRemainingMs > 0)
            {
                slot.RespawnRemainingMs = Math.Max(0, slot.RespawnRemainingMs - StepDeltaMs);
            }

            if (slot.RespawnRemainingMs == 0)
            {
                // If no free tile exists, spawn is skipped deterministically for this step.
                TrySpawnMobInSlot(state, slot, events);
            }
        }
    }

    private static void TickDecals(StoredBattle state)
    {
        if (state.Decals.Count == 0)
        {
            return;
        }

        for (var index = state.Decals.Count - 1; index >= 0; index -= 1)
        {
            var decal = state.Decals[index];
            decal.RemainingMs = Math.Max(0, decal.RemainingMs - StepDeltaMs);
            if (decal.RemainingMs == 0)
            {
                state.Decals.RemoveAt(index);
            }
        }
    }
}
