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

    private static void TickSilverTempestDuration(StoredBattle state)
    {
        if (!state.SilverTempestActive && state.SilverTempestRemainingMs <= 0)
        {
            return;
        }

        state.SilverTempestRemainingMs = Math.Max(0, state.SilverTempestRemainingMs - StepDeltaMs);
        if (state.SilverTempestRemainingMs > 0)
        {
            state.SilverTempestActive = true;
            return;
        }

        state.SilverTempestActive = false;
        state.SilverTempestRemainingMs = 0;
    }

    private static void TickPendingWhisperShotHits(StoredBattle state, List<BattleEventDto> events)
    {
        if (state.PendingWhisperShotHits.Count == 0)
        {
            return;
        }

        for (var index = state.PendingWhisperShotHits.Count - 1; index >= 0; index -= 1)
        {
            var pendingHit = state.PendingWhisperShotHits[index];
            var nextDelay = Math.Max(0, pendingHit.DelayRemainingMs - StepDeltaMs);
            if (nextDelay > 0)
            {
                state.PendingWhisperShotHits[index] = pendingHit with { DelayRemainingMs = nextDelay };
                continue;
            }

            state.PendingWhisperShotHits.RemoveAt(index);
            _ = TryResolveDeferredSylwenWhisperShotHit(state, events, pendingHit);
        }
    }

    private static void TickMobCombatCooldowns(StoredBattle state)
    {
        foreach (var slot in state.MobSlots.Values)
        {
            slot.AttackCooldownRemainingMs = Math.Max(0, slot.AttackCooldownRemainingMs - StepDeltaMs);
            slot.AbilityCooldownRemainingMs = Math.Max(0, slot.AbilityCooldownRemainingMs - StepDeltaMs);
        }
    }

    private static void TickMobImmobilizeDurations(StoredBattle state)
    {
        foreach (var actor in state.Actors.Values)
        {
            if (actor.Kind != "mob")
            {
                continue;
            }

            if (actor.StunRemainingMs > 0)
            {
                actor.StunRemainingMs = Math.Max(0, actor.StunRemainingMs - StepDeltaMs);
                if (actor.StunRemainingMs == 0)
                {
                    actor.IsStunned = false;
                }
            }

            if (actor.ImmobilizeRemainingMs > 0)
            {
                actor.ImmobilizeRemainingMs = Math.Max(0, actor.ImmobilizeRemainingMs - StepDeltaMs);
                if (actor.ImmobilizeRemainingMs == 0)
                {
                    actor.IsImmobilized = false;
                }
            }
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

            if (liveMob.IsStunned || liveMob.IsImmobilized)
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
        var nowMs = GetElapsedMsForTick(state.Tick);
        if (nowMs < state.MobSpawnPausedUntilMs)
        {
            return;
        }

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

    private static void TickDecals(StoredBattle state, List<BattleEventDto> events)
    {
        if (state.Decals.Count == 0)
        {
            return;
        }

        var player = GetPlayerActor(state);

        for (var index = state.Decals.Count - 1; index >= 0; index -= 1)
        {
            var decal = state.Decals[index];
            decal.RemainingMs = Math.Max(0, decal.RemainingMs - StepDeltaMs);

            if (decal.DecalKind == DecalKind.DamagingHazard && decal.DamagePerTick > 0)
            {
                if (string.Equals(decal.EntityType, ArenaConfig.SkillIds.SylwenThornfall, StringComparison.Ordinal))
                {
                    if (player is not null)
                    {
                        var mobsOnTile = state.Actors.Values
                            .Where(actor =>
                                (actor.Kind == "mob" || actor.Kind == "boss") &&
                                actor.Hp > 0 &&
                                actor.TileX == decal.TileX &&
                                actor.TileY == decal.TileY)
                            .OrderBy(actor => actor.ActorId, StringComparer.Ordinal)
                            .ToList();

                        System.Console.WriteLine(
                            $"[ThornfallTick] Tick={state.Tick} Tile=({decal.TileX},{decal.TileY}) " +
                            $"MobsOnTile={mobsOnTile.Count} RemainingMs={decal.RemainingMs}");

                        foreach (var mob in mobsOnTile)
                        {
                            var hpDamageApplied = ApplyDamageToMob(
                                state,
                                events,
                                mob,
                                decal.DamagePerTick,
                                GetPlayerBaseElement(state),
                                attacker: player,
                                allowCriticalHits: false);
                            ApplyPlayerLifeLeech(state, events, ComputeLifeLeechHeal(state, hpDamageApplied));
                        }
                    }
                }
                else if (string.Equals(decal.EntityType, ArenaConfig.SkillIds.VelvetUmbralPath, StringComparison.Ordinal))
                {
                    if (player is not null)
                    {
                        var mobsOnTile = state.Actors.Values
                            .Where(actor =>
                                (actor.Kind == "mob" || actor.Kind == "boss") &&
                                actor.Hp > 0 &&
                                actor.TileX == decal.TileX &&
                                actor.TileY == decal.TileY)
                            .OrderBy(actor => actor.ActorId, StringComparer.Ordinal)
                            .ToList();

                        foreach (var mob in mobsOnTile)
                        {
                            var hpDamageApplied = ApplyDamageToMob(
                                state,
                                events,
                                mob,
                                decal.DamagePerTick,
                                GetPlayerBaseElement(state),
                                attacker: player,
                                onSuccessfulHit: hitMob =>
                                {
                                    ApplyVelvetCorrosion(hitMob);
                                    events.Add(new CorrosionUpdatedEventDto(MobId: hitMob.ActorId, StackCount: hitMob.CorrosionStacks));
                                },
                                finalDamageMultiplierResolver: ResolveVelvetCorrosionDamageMultiplier);
                            ApplyPlayerLifeLeech(state, events, ComputeLifeLeechHeal(state, hpDamageApplied));
                        }
                    }
                }
                else if (player is not null &&
                         player.TileX == decal.TileX &&
                         player.TileY == decal.TileY)
                {
                    ApplyDamageToPlayer(
                        state,
                        events,
                        player,
                        decal.DamagePerTick,
                        ArenaConfig.DefaultMobElement,
                        attacker: null,
                        isRangedAutoAttack: false,
                        allowCriticalHits: false);
                }
            }

            if (decal.RemainingMs == 0)
            {
                state.Decals.RemoveAt(index);
            }
        }
    }
}
