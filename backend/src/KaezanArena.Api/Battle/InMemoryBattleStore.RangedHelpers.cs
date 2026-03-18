using KaezanArena.Api.Contracts.Battle;

namespace KaezanArena.Api.Battle;

public sealed partial class InMemoryBattleStore
{
    private readonly record struct RicochetSegment(
        List<TilePos> Tiles,
        TilePos Direction);

    private static readonly IReadOnlyList<TilePos> ShotgunCompassDirections =
    [
        new TilePos(0, -1),  // Up
        new TilePos(1, -1),  // UpRight
        new TilePos(1, 0),   // Right
        new TilePos(1, 1),   // DownRight
        new TilePos(0, 1),   // Down
        new TilePos(-1, 1),  // DownLeft
        new TilePos(-1, 0),  // Left
        new TilePos(-1, -1)  // UpLeft
    ];

    private static bool HasLineOfSight(TilePos from, TilePos to, StoredBattle state)
    {
        _ = from;
        _ = to;
        _ = state;
        // Obstacle check stubbed - will be populated when destructible obstacles are implemented.
        return true;
    }

    private static StoredActor? ResolveRangedTarget(StoredBattle state, int maxRange, bool requireLOS)
    {
        var player = GetPlayerActor(state);
        if (player is null)
        {
            return null;
        }

        var clampedRange = Math.Max(0, maxRange);
        var fromTile = new TilePos(player.TileX, player.TileY);

        bool IsValidTarget(StoredActor actor)
        {
            if (!string.Equals(actor.Kind, "mob", StringComparison.Ordinal) || actor.Hp <= 0)
            {
                return false;
            }

            if (ComputeChebyshevDistance(actor, player.TileX, player.TileY) > clampedRange)
            {
                return false;
            }

            return !requireLOS || HasLineOfSight(fromTile, new TilePos(actor.TileX, actor.TileY), state);
        }

        var lockedTarget = ResolveLockedTargetMobAnyDistance(state);
        if (lockedTarget is not null && IsValidTarget(lockedTarget))
        {
            return lockedTarget;
        }

        return state.Actors.Values
            .Where(IsValidTarget)
            .OrderBy(actor => ComputeChebyshevDistance(actor, player.TileX, player.TileY))
            .ThenBy(actor => actor.ActorId, StringComparer.Ordinal)
            .FirstOrDefault();
    }

    private static IReadOnlyList<TilePos> BuildShotgunConeTiles(
        TilePos from,
        TilePos target,
        int maxRange)
    {
        var clampedRange = Math.Max(0, maxRange);
        if (clampedRange == 0)
        {
            return [];
        }

        var primaryDirection = ResolveShotgunPrimaryDirection(from, target);
        var coneTiles = new List<TilePos>(clampedRange * clampedRange);
        var seenTiles = new HashSet<(int X, int Y)>();

        void TryAddTile(int tileX, int tileY)
        {
            if (!IsInBounds(tileX, tileY))
            {
                return;
            }

            if (!seenTiles.Add((tileX, tileY)))
            {
                return;
            }

            coneTiles.Add(new TilePos(tileX, tileY));
        }

        for (var distance = 1; distance <= clampedRange; distance += 1)
        {
            var centerX = from.X + (primaryDirection.X * distance);
            var centerY = from.Y + (primaryDirection.Y * distance);
            var lateralSpan = distance - 1;

            if (primaryDirection.X == 0 || primaryDirection.Y == 0)
            {
                var lateralDirection = primaryDirection.X == 0
                    ? new TilePos(1, 0)
                    : new TilePos(0, 1);
                for (var offset = -lateralSpan; offset <= lateralSpan; offset += 1)
                {
                    TryAddTile(
                        centerX + (lateralDirection.X * offset),
                        centerY + (lateralDirection.Y * offset));
                }

                continue;
            }

            TryAddTile(centerX, centerY);
            for (var offset = 1; offset <= lateralSpan; offset += 1)
            {
                // Diagonal cone rows widen into a Tibia-like "dragon wave" elbow:
                // one branch along X and one branch along Y around the forward center.
                TryAddTile(centerX - (primaryDirection.X * offset), centerY);
                TryAddTile(centerX, centerY - (primaryDirection.Y * offset));
            }
        }

        return coneTiles;
    }

    private static TilePos ResolveShotgunPrimaryDirection(TilePos from, TilePos target)
    {
        var stepX = Math.Sign(target.X - from.X);
        var stepY = Math.Sign(target.Y - from.Y);
        if (stepX == 0 && stepY == 0)
        {
            return new TilePos(0, -1);
        }

        return new TilePos(stepX, stepY);
    }

    private static IReadOnlyList<TilePos> BuildShotgunRepresentativeProjectileEndpoints(
        TilePos from,
        TilePos target,
        int visualProjectileCount,
        int maxRange)
    {
        var clampedProjectileCount = Math.Max(0, visualProjectileCount);
        var clampedRange = Math.Max(0, maxRange);
        if (clampedProjectileCount == 0 || clampedRange == 0)
        {
            return [];
        }

        var primaryDirection = ResolveShotgunPrimaryDirection(from, target);
        var primaryDirectionIndex = ResolveShotgunDirectionIndex(primaryDirection.X, primaryDirection.Y);
        var startOffset = -((clampedProjectileCount - 1) / 2);
        var endpoints = new List<TilePos>(clampedProjectileCount);

        for (var projectileIndex = 0; projectileIndex < clampedProjectileCount; projectileIndex += 1)
        {
            var directionOffset = startOffset + projectileIndex;
            var wrappedDirectionIndex =
                ((primaryDirectionIndex + directionOffset) % ShotgunCompassDirections.Count + ShotgunCompassDirections.Count)
                % ShotgunCompassDirections.Count;
            var direction = ShotgunCompassDirections[wrappedDirectionIndex];

            var hasInBoundsEndpoint = false;
            var endpointX = from.X;
            var endpointY = from.Y;
            for (var step = 1; step <= clampedRange; step += 1)
            {
                var tileX = from.X + (direction.X * step);
                var tileY = from.Y + (direction.Y * step);
                if (!IsInBounds(tileX, tileY))
                {
                    break;
                }

                endpointX = tileX;
                endpointY = tileY;
                hasInBoundsEndpoint = true;
            }

            if (hasInBoundsEndpoint)
            {
                endpoints.Add(new TilePos(endpointX, endpointY));
            }
        }

        return endpoints;
    }

    private static int ResolveShotgunDirectionIndex(int stepX, int stepY)
    {
        for (var index = 0; index < ShotgunCompassDirections.Count; index += 1)
        {
            var direction = ShotgunCompassDirections[index];
            if (direction.X == stepX && direction.Y == stepY)
            {
                return index;
            }
        }

        return 0;
    }

    private static int ApplyRangedDamageToMob(
        StoredBattle state,
        StoredActor target,
        int damage,
        string weaponId,
        List<BattleEventDto> events,
        bool emitProjectileEvent = true,
        bool projectilePierces = false,
        TilePos? projectileFromTile = null)
    {
        var player = GetPlayerActor(state);
        if (player is null || target.Hp <= 0)
        {
            return 0;
        }

        if (emitProjectileEvent)
        {
            events.Add(new RangedProjectileFiredEventDto(
                WeaponId: weaponId,
                FromTile: projectileFromTile ?? new TilePos(ArenaConfig.PlayerTileX, ArenaConfig.PlayerTileY),
                ToTile: new TilePos(target.TileX, target.TileY),
                TargetActorId: target.ActorId,
                Pierces: projectilePierces));
        }

        // Shared ranged damage path intentionally reuses the existing melee damage pipeline.
        // Pierce/ricochet behavior is weapon-specific and must be handled by the weapon implementation.
        var hpDamageApplied = ApplyDamageToMob(
            state,
            events,
            target,
            damage,
            GetPlayerBaseElement(state),
            attacker: player);

        ApplyPlayerLifeLeech(state, events, ComputeLifeLeechHeal(hpDamageApplied));
        return hpDamageApplied;
    }

    private static List<RicochetSegment> BuildVoidRicochetPath(
        TilePos from,
        TilePos target,
        int maxBounces,
        int maxTotalTiles)
    {
        var clampedBounces = Math.Max(0, maxBounces);
        var clampedTotalTiles = Math.Max(0, maxTotalTiles);
        if (clampedTotalTiles == 0)
        {
            return [];
        }

        var direction = ResolveShotgunPrimaryDirection(from, target);
        var segments = new List<RicochetSegment>();
        var currentDirection = direction;
        var currentTiles = new List<TilePos>();
        var currentX = from.X;
        var currentY = from.Y;
        var totalTiles = 0;
        var bounceCount = 0;
        var random = new Random();

        while (totalTiles < clampedTotalTiles)
        {
            currentX += currentDirection.X;
            currentY += currentDirection.Y;
            if (!IsInBounds(currentX, currentY))
            {
                break;
            }

            var tile = new TilePos(currentX, currentY);
            currentTiles.Add(tile);
            totalTiles += 1;

            var hitVerticalBorder = currentX == 0 || currentX == ArenaConfig.Width - 1;
            var hitHorizontalBorder = currentY == 0 || currentY == ArenaConfig.Height - 1;
            if (!hitVerticalBorder && !hitHorizontalBorder)
            {
                continue;
            }

            if (currentTiles.Count > 0)
            {
                segments.Add(new RicochetSegment(new List<TilePos>(currentTiles), currentDirection));
                currentTiles = [];
            }

            if (bounceCount >= clampedBounces || totalTiles >= clampedTotalTiles)
            {
                break;
            }

            var validDirections = ShotgunCompassDirections
                .Where(direction => IsInBounds(currentX + direction.X, currentY + direction.Y))
                .ToList();
            if (validDirections.Count == 0)
            {
                break;
            }

            // Intentionally random (non-deterministic) — ricochet chaos is a design feature.
            // Replays will not reproduce the same trajectory.
            currentDirection = validDirections[random.Next(validDirections.Count)];
            bounceCount += 1;
        }

        if (currentTiles.Count > 0)
        {
            segments.Add(new RicochetSegment(currentTiles, currentDirection));
        }

        return segments;
    }

    private static bool TryApplyKnockback(
        StoredBattle state,
        StoredActor mob,
        TilePos direction,
        int tiles,
        List<BattleEventDto> events)
    {
        if (mob.Hp <= 0 || tiles <= 0)
        {
            return false;
        }

        var stepX = Math.Sign(direction.X);
        var stepY = Math.Sign(direction.Y);
        if (stepX == 0 && stepY == 0)
        {
            return false;
        }

        var fromTile = new TilePos(mob.TileX, mob.TileY);
        var remainingSteps = tiles;
        while (remainingSteps > 0)
        {
            var destinationX = mob.TileX + stepX;
            var destinationY = mob.TileY + stepY;
            if (!IsInBounds(destinationX, destinationY))
            {
                break;
            }

            var destinationOccupied = state.Actors.Values.Any(actor =>
                !string.Equals(actor.ActorId, mob.ActorId, StringComparison.Ordinal) &&
                actor.TileX == destinationX &&
                actor.TileY == destinationY);
            if (destinationOccupied)
            {
                break;
            }

            mob.TileX = destinationX;
            mob.TileY = destinationY;
            remainingSteps -= 1;
        }

        if (mob.TileX == fromTile.X && mob.TileY == fromTile.Y)
        {
            return false;
        }

        events.Add(new MobKnockedBackEventDto(
            ActorId: mob.ActorId,
            FromTile: fromTile,
            ToTile: new TilePos(mob.TileX, mob.TileY)));
        return true;
    }

    private static bool TryExecuteShotgun(StoredBattle state, List<BattleEventDto> events)
    {
        if (!state.Skills.TryGetValue(ArenaConfig.ShotgunSkillId, out var skill))
        {
            return false;
        }

        if (skill.CooldownRemainingMs > 0 || state.PlayerGlobalCooldownRemainingMs > 0)
        {
            return false;
        }

        var player = GetPlayerActor(state);
        if (player is null)
        {
            return false;
        }

        var target = ResolveRangedTarget(
            state,
            ArenaConfig.ShotgunMaxRange,
            ArenaConfig.ShotgunRequiresLOS);
        if (target is null)
        {
            return false;
        }

        var fromTile = new TilePos(player.TileX, player.TileY);
        var targetTile = new TilePos(target.TileX, target.TileY);
        var primaryDirection = ResolveShotgunPrimaryDirection(fromTile, targetTile);
        var coneTiles = BuildShotgunConeTiles(
            fromTile,
            targetTile,
            ArenaConfig.ShotgunMaxRange);
        if (coneTiles.Count == 0)
        {
            return false;
        }

        var hitActorIds = new List<string>();
        var hitActorIdsSet = new HashSet<string>(StringComparer.Ordinal);
        var livingMobsByTile = state.Actors.Values
            .Where(actor => string.Equals(actor.Kind, "mob", StringComparison.Ordinal) && actor.Hp > 0)
            .ToDictionary(actor => (actor.TileX, actor.TileY), actor => actor.ActorId);
        foreach (var tile in coneTiles)
        {
            if (!livingMobsByTile.TryGetValue((tile.X, tile.Y), out var actorId))
            {
                continue;
            }

            if (hitActorIdsSet.Add(actorId))
            {
                hitActorIds.Add(actorId);
            }
        }

        var representativeProjectileEndpoints = BuildShotgunRepresentativeProjectileEndpoints(
            fromTile,
            targetTile,
            ArenaConfig.ShotgunVisualProjectileCount,
            ArenaConfig.ShotgunMaxRange);
        foreach (var endpoint in representativeProjectileEndpoints)
        {
            events.Add(new RangedProjectileFiredEventDto(
                WeaponId: ArenaConfig.WeaponIds.ShotgunId,
                FromTile: fromTile,
                ToTile: endpoint,
                TargetActorId: null,
                Pierces: false));
        }

        foreach (var hitActorId in hitActorIds)
        {
            if (!state.Actors.TryGetValue(hitActorId, out var liveMob) || liveMob.Hp <= 0)
            {
                continue;
            }

            ApplyRangedDamageToMob(
                state,
                liveMob,
                ArenaConfig.ShotgunDamageBase,
                ArenaConfig.WeaponIds.ShotgunId,
                events);

            if (liveMob.Hp <= 0)
            {
                continue;
            }

            TryApplyKnockback(
                state,
                liveMob,
                primaryDirection,
                ArenaConfig.ShotgunKnockbackTiles,
                events);
        }

        ApplyPlayerCooldownsForCast(state, skill);
        events.Add(new AssistCastEventDto(ArenaConfig.ShotgunSkillId, ArenaConfig.AssistReasonAutoOffense));
        return true;
    }

    private static bool TryExecuteVoidRicochet(StoredBattle state, List<BattleEventDto> events)
    {
        if (!state.Skills.TryGetValue(ArenaConfig.VoidRicochetSkillId, out var skill))
        {
            return false;
        }

        if (skill.CooldownRemainingMs > 0 || state.PlayerGlobalCooldownRemainingMs > 0)
        {
            return false;
        }

        var player = GetPlayerActor(state);
        if (player is null)
        {
            return false;
        }

        var target = ResolveRangedTarget(
            state,
            ArenaConfig.AutoAttackRangedMaxRange,
            ArenaConfig.VoidRicochetRequiresLOS);
        if (target is null)
        {
            return false;
        }

        var path = BuildVoidRicochetPath(
            from: new TilePos(player.TileX, player.TileY),
            target: new TilePos(target.TileX, target.TileY),
            maxBounces: ArenaConfig.VoidRicochetMaxBounces,
            maxTotalTiles: ArenaConfig.VoidRicochetMaxTotalTiles);
        if (path.Count == 0)
        {
            return false;
        }

        foreach (var segment in path)
        {
            if (segment.Tiles.Count == 0)
            {
                continue;
            }

            foreach (var tile in segment.Tiles)
            {
                var mobsOnTile = state.Actors.Values
                    .Where(actor =>
                        string.Equals(actor.Kind, "mob", StringComparison.Ordinal) &&
                        actor.Hp > 0 &&
                        actor.TileX == tile.X &&
                        actor.TileY == tile.Y)
                    .OrderBy(actor => actor.ActorId, StringComparer.Ordinal)
                    .ToList();

                foreach (var mob in mobsOnTile)
                {
                    ApplyRangedDamageToMob(
                        state,
                        mob,
                        ArenaConfig.VoidRicochetDamageBase,
                        ArenaConfig.WeaponIds.VoidRicochetId,
                        events,
                        emitProjectileEvent: false);
                }
            }

            events.Add(new RangedProjectileFiredEventDto(
                WeaponId: ArenaConfig.WeaponIds.VoidRicochetId,
                FromTile: segment.Tiles[0],
                ToTile: segment.Tiles[segment.Tiles.Count - 1],
                TargetActorId: null,
                Pierces: true));
        }

        ApplyPlayerCooldownsForCast(state, skill);
        events.Add(new AssistCastEventDto(ArenaConfig.VoidRicochetSkillId, ArenaConfig.AssistReasonAutoOffense));
        return true;
    }

    private static bool TryExecuteSigilBolt(StoredBattle state, List<BattleEventDto> events)
    {
        if (!state.Skills.TryGetValue(ArenaConfig.SigilBoltSkillId, out var skill))
        {
            return false;
        }

        if (skill.CooldownRemainingMs > 0 || state.PlayerGlobalCooldownRemainingMs > 0)
        {
            return false;
        }

        var target = ResolveRangedTarget(
            state,
            ArenaConfig.SigilBoltMaxRange,
            ArenaConfig.SigilBoltRequiresLOS);
        if (target is null)
        {
            return false;
        }

        ApplyRangedDamageToMob(
            state,
            target,
            ArenaConfig.SigilBoltDamageBase,
            ArenaConfig.WeaponIds.SigilBolt,
            events);

        ApplyPlayerCooldownsForCast(state, skill);
        events.Add(new AssistCastEventDto(ArenaConfig.SigilBoltSkillId, ArenaConfig.AssistReasonAutoOffense));
        return true;
    }
}
