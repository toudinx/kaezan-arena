using KaezanArena.Api.Contracts.Battle;

namespace KaezanArena.Api.Battle;

public sealed partial class InMemoryBattleStore
{
    private static bool TryGetFirstWalkableGreedyStepTowardTarget(
        StoredBattle state,
        StoredActor mob,
        int targetTileX,
        int targetTileY,
        out (int TileX, int TileY)? destination)
    {
        destination = null;
        foreach (var candidate in BuildGreedyStepCandidates(mob, targetTileX - mob.TileX, targetTileY - mob.TileY))
        {
            if (!IsWalkableTile(state, mob, candidate))
            {
                continue;
            }

            destination = candidate;
            return true;
        }

        return false;
    }

    private static bool TryGetFirstWalkableGreedyStepAwayFromTarget(
        StoredBattle state,
        StoredActor mob,
        int targetTileX,
        int targetTileY,
        out (int TileX, int TileY)? destination)
    {
        destination = null;
        foreach (var candidate in BuildGreedyStepCandidates(mob, mob.TileX - targetTileX, mob.TileY - targetTileY))
        {
            if (!IsWalkableTile(state, mob, candidate))
            {
                continue;
            }

            destination = candidate;
            return true;
        }

        return false;
    }

    private static IEnumerable<(int TileX, int TileY)> BuildGreedyStepCandidates(StoredActor mob, int deltaX, int deltaY)
    {
        var stepX = Math.Sign(deltaX);
        var stepY = Math.Sign(deltaY);

        (int TileX, int TileY)? preferredTile;
        (int TileX, int TileY)? fallbackTile;

        if (Math.Abs(deltaX) >= Math.Abs(deltaY))
        {
            preferredTile = stepX == 0 ? null : (mob.TileX + stepX, mob.TileY);
            fallbackTile = stepY == 0 ? null : (mob.TileX, mob.TileY + stepY);
        }
        else
        {
            preferredTile = stepY == 0 ? null : (mob.TileX, mob.TileY + stepY);
            fallbackTile = stepX == 0 ? null : (mob.TileX + stepX, mob.TileY);
        }

        if (preferredTile.HasValue)
        {
            yield return preferredTile.Value;
        }

        if (fallbackTile.HasValue)
        {
            yield return fallbackTile.Value;
        }
    }

    private static bool IsWalkableTile(StoredBattle state, StoredActor mob, (int TileX, int TileY) destination)
    {
        if (!IsInBounds(destination.TileX, destination.TileY))
        {
            return false;
        }

        var isOccupiedByActor = state.Actors.Values.Any(actor =>
            !string.Equals(actor.ActorId, mob.ActorId, StringComparison.Ordinal) &&
            actor.TileX == destination.TileX &&
            actor.TileY == destination.TileY);
        if (isOccupiedByActor)
        {
            return false;
        }

        var nowMs = GetElapsedMsForTick(state.Tick);
        var isOccupiedByPoi = state.Pois.Values.Any(poi =>
            poi.ExpiresAtMs > nowMs &&
            poi.TileX == destination.TileX &&
            poi.TileY == destination.TileY);
        return !isOccupiedByPoi;
    }

    private static bool TryMoveMobToTile(StoredBattle state, StoredActor mob, (int TileX, int TileY)? destination)
    {
        if (!destination.HasValue)
        {
            return false;
        }

        var (destinationX, destinationY) = destination.Value;
        if (!IsWalkableTile(state, mob, (destinationX, destinationY)))
        {
            return false;
        }

        mob.TileX = destinationX;
        mob.TileY = destinationY;
        return true;
    }

    private static void SetRangedCommitWindowIfNeeded(MobSlotState slot)
    {
        if (!IsRangedArchetype(slot.Archetype))
        {
            return;
        }

        slot.CommitTicksRemaining = ArenaConfig.RangedCommitWindowTicks;
    }

    private static bool IsRangedArchetype(MobArchetype archetype)
    {
        return archetype is MobArchetype.RangedArcher
            or MobArchetype.RangedShaman
            or MobArchetype.RangedImp
            or MobArchetype.RangedSwampy
            or MobArchetype.RangedMuddy;
    }

    private static bool TryChooseRangedBandMove(
        StoredBattle state,
        StoredActor mob,
        StoredActor player,
        MobSlotState slot,
        out (int TileX, int TileY)? destination)
    {
        return TryChooseRangedBandMoveWithDistances(
            state, mob, player, slot,
            preferredMin: ArenaConfig.RangedPreferredDistanceMin,
            preferredMax: ArenaConfig.RangedPreferredDistanceMax,
            out destination);
    }

    private static bool TryChooseAggressiveBandMove(
        StoredBattle state,
        StoredActor mob,
        StoredActor player,
        MobSlotState slot,
        out (int TileX, int TileY)? destination)
    {
        return TryChooseRangedBandMoveWithDistances(
            state, mob, player, slot,
            preferredMin: ArenaConfig.RangedMuddyPreferredDistanceMin,
            preferredMax: ArenaConfig.RangedMuddyPreferredDistanceMax,
            out destination);
    }

    private static bool TryChooseRangedBandMoveWithDistances(
        StoredBattle state,
        StoredActor mob,
        StoredActor player,
        MobSlotState slot,
        int preferredMin,
        int preferredMax,
        out (int TileX, int TileY)? destination)
    {
        if (slot.CommitTicksRemaining > 0)
        {
            SetMobFacingTowardTarget(mob, player.TileX, player.TileY);
            destination = null;
            return false;
        }

        var distance = ComputeChebyshevDistance(mob, player.TileX, player.TileY);
        if (distance >= preferredMax + 1)
        {
            return TryGetFirstWalkableGreedyStepTowardTarget(state, mob, player.TileX, player.TileY, out destination);
        }

        if (distance <= preferredMin - 1)
        {
            return TryGetFirstWalkableGreedyStepAwayFromTarget(state, mob, player.TileX, player.TileY, out destination);
        }

        if (TryGetFirstWalkableBandOrbitStep(state, mob, player, distance, preferredMin, preferredMax, out destination))
        {
            return true;
        }

        destination = null;
        return false;
    }

    private static bool TryGetFirstWalkableBandOrbitStep(
        StoredBattle state,
        StoredActor mob,
        StoredActor player,
        int currentDistance,
        int preferredMin,
        int preferredMax,
        out (int TileX, int TileY)? destination)
    {
        destination = null;
        (int TileX, int TileY)? fallbackBandStep = null;
        foreach (var offset in EnumerateDeterministicNeighborOffsets())
        {
            var candidate = (TileX: mob.TileX + offset.OffsetX, TileY: mob.TileY + offset.OffsetY);
            if (!IsWalkableTile(state, mob, candidate))
            {
                continue;
            }

            var nextDistance = ComputeChebyshevDistance(candidate.TileX, candidate.TileY, player.TileX, player.TileY);
            if (nextDistance < preferredMin || nextDistance > preferredMax)
            {
                continue;
            }

            if (nextDistance == currentDistance)
            {
                destination = candidate;
                return true;
            }

            fallbackBandStep ??= candidate;
        }

        if (fallbackBandStep.HasValue)
        {
            destination = fallbackBandStep.Value;
            return true;
        }

        return false;
    }

    private static IEnumerable<(int OffsetX, int OffsetY)> EnumerateDeterministicNeighborOffsets()
    {
        yield return (0, -1);
        yield return (1, -1);
        yield return (1, 0);
        yield return (1, 1);
        yield return (0, 1);
        yield return (-1, 1);
        yield return (-1, 0);
        yield return (-1, -1);
    }

    private static void SetMobFacingTowardTarget(StoredActor mob, int targetTileX, int targetTileY)
    {
        mob.FacingDirection = ResolveFacingDirectionTowardTile(
            mob.TileX,
            mob.TileY,
            targetTileX,
            targetTileY,
            mob.FacingDirection);
    }

    private static string ResolveFacingDirectionTowardTile(
        int sourceTileX,
        int sourceTileY,
        int targetTileX,
        int targetTileY,
        string currentFacingDirection)
    {
        var deltaX = targetTileX - sourceTileX;
        var deltaY = targetTileY - sourceTileY;
        if (deltaX == 0 && deltaY == 0)
        {
            return currentFacingDirection;
        }

        if (Math.Abs(deltaX) >= Math.Abs(deltaY))
        {
            if (deltaX > 0)
            {
                return ArenaConfig.FacingRight;
            }

            if (deltaX < 0)
            {
                return ArenaConfig.FacingLeft;
            }
        }
        else
        {
            if (deltaY > 0)
            {
                return ArenaConfig.FacingDown;
            }

            if (deltaY < 0)
            {
                return ArenaConfig.FacingUp;
            }
        }

        return currentFacingDirection;
    }
}
