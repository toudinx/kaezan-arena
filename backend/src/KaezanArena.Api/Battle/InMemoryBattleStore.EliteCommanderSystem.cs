using KaezanArena.Api.Contracts.Battle;

namespace KaezanArena.Api.Battle;

public sealed partial class InMemoryBattleStore
{
    private static void MaintainEliteCommanderBuffs(StoredBattle state, List<BattleEventDto>? events)
    {
        var elites = state.Actors.Values
            .Where(actor =>
                string.Equals(actor.Kind, "mob", StringComparison.Ordinal) &&
                actor.IsElite)
            .OrderBy(actor => actor.ActorId, StringComparer.Ordinal)
            .ToList();
        if (elites.Count == 0)
        {
            return;
        }

        var aliveEliteIds = elites
            .Select(elite => elite.ActorId)
            .ToHashSet(StringComparer.Ordinal);
        var staleBuffTargets = state.Actors.Values
            .Where(actor =>
                string.Equals(actor.Kind, "mob", StringComparison.Ordinal) &&
                !actor.IsElite &&
                actor.BuffSourceEliteId is not null &&
                !aliveEliteIds.Contains(actor.BuffSourceEliteId))
            .OrderBy(actor => actor.ActorId, StringComparer.Ordinal)
            .ToList();
        foreach (var staleTarget in staleBuffTargets)
        {
            if (staleTarget.BuffSourceEliteId is not string staleSourceEliteId)
            {
                continue;
            }

            TryRemoveEliteCommanderBuffFromMob(staleTarget, staleSourceEliteId, events);
        }

        foreach (var elite in elites)
        {
            var assignedCount = state.Actors.Values.Count(actor =>
                string.Equals(actor.Kind, "mob", StringComparison.Ordinal) &&
                !actor.IsElite &&
                string.Equals(actor.BuffSourceEliteId, elite.ActorId, StringComparison.Ordinal));
            var remaining = ArenaConfig.EliteCommanderMaxBuffTargets - assignedCount;
            if (remaining <= 0)
            {
                continue;
            }

            var sameSpeciesCandidates = state.Actors.Values
                .Where(actor =>
                    IsValidEliteBuffTarget(elite, actor) &&
                    actor.MobType == elite.MobType)
                .OrderBy(actor => actor.ActorId, StringComparer.Ordinal)
                .ToList();
            var anyCandidates = state.Actors.Values
                .Where(actor => IsValidEliteBuffTarget(elite, actor))
                .OrderBy(actor => actor.ActorId, StringComparer.Ordinal)
                .ToList();

            while (remaining > 0)
            {
                var candidatePool = sameSpeciesCandidates.Count > 0
                    ? sameSpeciesCandidates
                    : anyCandidates;
                if (candidatePool.Count == 0)
                {
                    break;
                }

                var selectedIndex = NextIntFromBattleRng(state, candidatePool.Count);
                var selected = candidatePool[selectedIndex];
                selected.BuffSourceEliteId = elite.ActorId;
                events?.Add(new EliteBuffAppliedEventDto(
                    EliteEntityId: elite.ActorId,
                    TargetEntityId: selected.ActorId));
                remaining -= 1;

                sameSpeciesCandidates.RemoveAll(candidate =>
                    string.Equals(candidate.ActorId, selected.ActorId, StringComparison.Ordinal));
                anyCandidates.RemoveAll(candidate =>
                    string.Equals(candidate.ActorId, selected.ActorId, StringComparison.Ordinal));
            }
        }
    }

    private static bool IsValidEliteBuffTarget(StoredActor elite, StoredActor candidate)
    {
        return string.Equals(candidate.Kind, "mob", StringComparison.Ordinal) &&
               !candidate.IsElite &&
               !candidate.IsMimic &&
               candidate.Hp > 0 &&
               string.IsNullOrWhiteSpace(candidate.BuffSourceEliteId) &&
               !string.Equals(candidate.ActorId, elite.ActorId, StringComparison.Ordinal);
    }

    private static bool TryRemoveEliteCommanderBuffFromMob(
        StoredActor mob,
        string sourceEliteId,
        List<BattleEventDto>? events)
    {
        if (!string.Equals(mob.BuffSourceEliteId, sourceEliteId, StringComparison.Ordinal))
        {
            return false;
        }

        mob.BuffSourceEliteId = null;
        events?.Add(new EliteBuffRemovedEventDto(
            EliteEntityId: sourceEliteId,
            TargetEntityId: mob.ActorId));
        return true;
    }

    private static void TickEliteDocRegen(StoredBattle state, List<BattleEventDto> events)
    {
        var docBuffedMobs = state.Actors.Values
            .Where(actor =>
                string.Equals(actor.Kind, "mob", StringComparison.Ordinal) &&
                !actor.IsElite &&
                actor.Hp > 0 &&
                actor.BuffSourceEliteId is not null &&
                state.Actors.TryGetValue(actor.BuffSourceEliteId, out var srcElite) &&
                srcElite.MobType == MobArchetype.EliteDoc)
            .ToList();

        foreach (var mob in docBuffedMobs)
        {
            if (mob.Hp >= mob.MaxHp)
            {
                continue;
            }

            var healed = Math.Min(ArenaConfig.EliteCommanderHpRegenPerTick, mob.MaxHp - mob.Hp);
            mob.Hp += healed;
            events.Add(new HealNumberEventDto(
                ActorId: mob.ActorId,
                Amount: healed,
                Source: "elite_doc_regen"));
        }
    }

    private static void RemoveEliteCommanderBuffs(StoredBattle state, string eliteActorId, List<BattleEventDto>? events)
    {
        var buffedTargets = state.Actors.Values
            .Where(actor =>
                string.Equals(actor.Kind, "mob", StringComparison.Ordinal) &&
                !actor.IsElite &&
                string.Equals(actor.BuffSourceEliteId, eliteActorId, StringComparison.Ordinal))
            .OrderBy(actor => actor.ActorId, StringComparer.Ordinal)
            .ToList();
        foreach (var target in buffedTargets)
        {
            TryRemoveEliteCommanderBuffFromMob(target, eliteActorId, events);
        }
    }
}
