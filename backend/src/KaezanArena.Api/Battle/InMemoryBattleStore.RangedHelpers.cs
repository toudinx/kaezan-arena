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
            if (actor.Kind != "mob" && actor.Kind != "boss")
            {
                return false;
            }

            if (actor.Hp <= 0)
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

    private static IReadOnlyList<TilePos> BuildLineTilesBresenham(TilePos from, TilePos to, bool includeSource = false)
    {
        var x0 = from.X;
        var y0 = from.Y;
        var x1 = to.X;
        var y1 = to.Y;
        var dx = Math.Abs(x1 - x0);
        var dy = Math.Abs(y1 - y0);
        var sx = x0 < x1 ? 1 : -1;
        var sy = y0 < y1 ? 1 : -1;
        var err = dx - dy;

        var tiles = new List<TilePos>();
        while (true)
        {
            if ((includeSource || x0 != from.X || y0 != from.Y) && IsInBounds(x0, y0))
            {
                tiles.Add(new TilePos(x0, y0));
            }

            if (x0 == x1 && y0 == y1)
            {
                break;
            }

            var e2 = 2 * err;
            if (e2 > -dy)
            {
                err -= dy;
                x0 += sx;
            }

            if (e2 < dx)
            {
                err += dx;
                y0 += sy;
            }
        }

        return tiles;
    }

    private static IReadOnlyList<TilePos> BuildFacingLineTilesToArenaEdge(TilePos from, string facingDirection, int maxRange)
    {
        var clampedRange = Math.Max(0, maxRange);
        if (clampedRange == 0)
        {
            return [];
        }

        var (stepX, stepY) = ResolveDirectionStep(facingDirection);
        if (stepX == 0 && stepY == 0)
        {
            return [];
        }

        var tiles = new List<TilePos>(clampedRange);
        for (var step = 1; step <= clampedRange; step += 1)
        {
            var tileX = from.X + (stepX * step);
            var tileY = from.Y + (stepY * step);
            if (!IsInBounds(tileX, tileY))
            {
                break;
            }

            tiles.Add(new TilePos(tileX, tileY));
        }

        return tiles;
    }

    private static (int StepX, int StepY) ResolveDirectionStep(string facingDirection)
    {
        var normalizedFacing = NormalizeDirection(facingDirection) ?? ArenaConfig.FacingUp;
        return normalizedFacing switch
        {
            ArenaConfig.FacingUp => (0, -1),
            ArenaConfig.FacingUpRight => (1, -1),
            ArenaConfig.FacingRight => (1, 0),
            ArenaConfig.FacingDownRight => (1, 1),
            ArenaConfig.FacingDown => (0, 1),
            ArenaConfig.FacingDownLeft => (-1, 1),
            ArenaConfig.FacingLeft => (-1, 0),
            ArenaConfig.FacingUpLeft => (-1, -1),
            _ => (0, -1)
        };
    }

    private static IReadOnlyList<string> ResolveLivingActorIdsOnTilesInOrder(StoredBattle state, IReadOnlyList<TilePos> tiles)
    {
        var actorIds = new List<string>();
        var seenActorIds = new HashSet<string>(StringComparer.Ordinal);
        foreach (var tile in tiles)
        {
            var actorsOnTile = state.Actors.Values
                .Where(actor =>
                    (actor.Kind == "mob" || actor.Kind == "boss") &&
                    actor.Hp > 0 &&
                    actor.TileX == tile.X &&
                    actor.TileY == tile.Y)
                .OrderBy(actor => actor.ActorId, StringComparer.Ordinal);

            foreach (var actor in actorsOnTile)
            {
                if (!seenActorIds.Add(actor.ActorId))
                {
                    continue;
                }

                actorIds.Add(actor.ActorId);
            }
        }

        return actorIds;
    }

    private static bool TryExecuteSylwenWhisperShot(
        StoredBattle state,
        List<BattleEventDto> events,
        StoredActor player)
    {
        var target = ResolveRangedTarget(
            state,
            ArenaConfig.SkillConfig.SylwenWhisperShotMaxRangeTilesChebyshev,
            requireLOS: false);
        if (target is null)
        {
            return false;
        }

        var fromTile = new TilePos(player.TileX, player.TileY);
        var targetTile = new TilePos(target.TileX, target.TileY);
        var lineTiles = BuildLineTilesBresenham(fromTile, targetTile, includeSource: false);
        if (lineTiles.Count == 0)
        {
            lineTiles = new List<TilePos> { targetTile };
        }

        var hitActorIds = new List<string>();
        if (state.SilverTempestActive)
        {
            hitActorIds.AddRange(ResolveLivingActorIdsOnTilesInOrder(state, lineTiles));
        }
        else
        {
            foreach (var tile in lineTiles)
            {
                var firstActorOnTile = state.Actors.Values
                    .Where(actor =>
                        (actor.Kind == "mob" || actor.Kind == "boss") &&
                        actor.Hp > 0 &&
                        actor.TileX == tile.X &&
                        actor.TileY == tile.Y)
                    .OrderBy(actor => actor.ActorId, StringComparer.Ordinal)
                    .FirstOrDefault();
                if (firstActorOnTile is null)
                {
                    continue;
                }

                hitActorIds.Add(firstActorOnTile.ActorId);
                break;
            }
        }

        if (hitActorIds.Count == 0 && target.Hp > 0)
        {
            hitActorIds.Add(target.ActorId);
        }

        var hitAnyTarget = false;
        foreach (var hitActorId in hitActorIds.Distinct(StringComparer.Ordinal))
        {
            var hitApplied = TryApplySylwenWhisperShotHit(
                state,
                events,
                hitActorId,
                fromTile,
                ArenaConfig.SkillConfig.SylwenWhisperShotDamage,
                projectilePierces: state.SilverTempestActive,
                isSilverTempestFollowUp: false);
            if (!hitApplied)
            {
                continue;
            }

            hitAnyTarget = true;
        }

        return hitAnyTarget;
    }

    private static bool TryResolveDeferredSylwenWhisperShotHit(
        StoredBattle state,
        List<BattleEventDto> events,
        PendingHit pendingHit)
    {
        var player = GetPlayerActor(state);
        if (player is null)
        {
            return false;
        }

        return TryApplySylwenWhisperShotHit(
            state,
            events,
            pendingHit.TargetActorId,
            new TilePos(player.TileX, player.TileY),
            pendingHit.DamageBase,
            projectilePierces: true,
            isSilverTempestFollowUp: true);
    }

    private static bool TryApplySylwenWhisperShotHit(
        StoredBattle state,
        List<BattleEventDto> events,
        string targetActorId,
        TilePos fromTile,
        int damageBase,
        bool projectilePierces,
        bool isSilverTempestFollowUp)
    {
        if (!state.Actors.TryGetValue(targetActorId, out var liveTarget) || liveTarget.Hp <= 0)
        {
            return false;
        }

        var canApplyDeadeyeGrace = string.Equals(liveTarget.Kind, "mob", StringComparison.Ordinal);
        if (canApplyDeadeyeGrace)
        {
            ApplySylwenDeadeyeGraceOnWhisperHit(liveTarget);
        }

        var totalDamage = Math.Max(0, damageBase);
        if (canApplyDeadeyeGrace)
        {
            totalDamage += ResolveSylwenFocusBonusDamage(liveTarget);
        }

        var isHeadshot = canApplyDeadeyeGrace && IsHeadshot(liveTarget);
        if (isHeadshot)
        {
            totalDamage = ApplyPercentIncrease(
                totalDamage,
                ArenaConfig.SkillConfig.SylwenDeadeyeGraceHeadshotDamageBonusPercent);
        }

        var hpDamageApplied = ApplyRangedDamageToMob(
            state,
            liveTarget,
            totalDamage,
            ArenaConfig.SkillIds.SylwenWhisperShot,
            events,
            emitProjectileEvent: true,
            projectilePierces: projectilePierces,
            projectileFromTile: fromTile,
            isSilverTempestFollowUp: isSilverTempestFollowUp);

        if (!isHeadshot)
        {
            return true;
        }

        if (liveTarget.Hp > 0)
        {
            liveTarget.IsStunned = true;
            liveTarget.StunRemainingMs = ArenaConfig.SkillConfig.SylwenDeadeyeGraceStunDurationMs;
        }

        events.Add(new HeadshotEventDto(
            MobId: liveTarget.ActorId,
            DamageDealt: hpDamageApplied));
        return true;
    }

    private static bool TryExecuteSylwenGalePierce(
        StoredBattle state,
        List<BattleEventDto> events,
        StoredActor player)
    {
        var fromTile = new TilePos(player.TileX, player.TileY);
        var lineTiles = BuildFacingLineTilesToArenaEdge(
            fromTile,
            state.PlayerFacingDirection,
            ArenaConfig.SkillConfig.SylwenGalePierceMaxRangeTilesChebyshev);
        if (lineTiles.Count == 0)
        {
            return false;
        }

        var (stepX, stepY) = ResolveDirectionStep(state.PlayerFacingDirection);
        var hitActorIds = ResolveLivingActorIdsOnTilesInOrder(state, lineTiles);
        if (hitActorIds.Count == 0)
        {
            return false;
        }

        events.Add(new RangedProjectileFiredEventDto(
            WeaponId: ArenaConfig.SkillIds.SylwenGalePierce,
            FromTile: fromTile,
            ToTile: lineTiles[lineTiles.Count - 1],
            TargetActorId: null,
            Pierces: true));

        var hitAnyTarget = false;
        foreach (var hitActorId in hitActorIds)
        {
            if (!state.Actors.TryGetValue(hitActorId, out var liveTarget) || liveTarget.Hp <= 0)
            {
                continue;
            }

            _ = ApplyRangedDamageToMob(
                state,
                liveTarget,
                ArenaConfig.SkillConfig.SylwenGalePierceDamage,
                ArenaConfig.SkillIds.SylwenGalePierce,
                events,
                emitProjectileEvent: false,
                projectilePierces: true,
                projectileFromTile: fromTile);
            hitAnyTarget = true;

            if (liveTarget.Hp <= 0)
            {
                continue;
            }

            var wasDisplaced = TryApplyKnockback(
                state,
                liveTarget,
                new TilePos(stepX, stepY),
                ArenaConfig.SkillConfig.SylwenGalePierceKnockbackTiles,
                events);
            if (!wasDisplaced || liveTarget.Hp <= 0)
            {
                continue;
            }

            liveTarget.IsStunned = true;
            liveTarget.StunRemainingMs = Math.Max(
                liveTarget.StunRemainingMs,
                ArenaConfig.SkillConfig.SylwenGalePierceStunMs);
        }

        return hitAnyTarget;
    }

    private static bool TryExecuteVelvetVoidChain(
        StoredBattle state,
        List<BattleEventDto> events,
        StoredActor player)
    {
        var currentTarget = ResolveRangedTarget(
            state,
            ArenaConfig.SkillConfig.VelvetVoidChainMaxRangeTilesChebyshev,
            requireLOS: false);
        if (currentTarget is null)
        {
            return false;
        }

        var hitSet = new HashSet<string>(StringComparer.Ordinal);
        var fromTile = new TilePos(player.TileX, player.TileY);
        var hitAnyTarget = false;

        while (currentTarget is not null &&
               currentTarget.Hp > 0 &&
               hitSet.Add(currentTarget.ActorId))
        {
            var toTile = new TilePos(currentTarget.TileX, currentTarget.TileY);
            events.Add(new RangedProjectileFiredEventDto(
                WeaponId: ArenaConfig.SkillIds.VelvetVoidChain,
                FromTile: fromTile,
                ToTile: toTile,
                TargetActorId: currentTarget.ActorId,
                Pierces: true,
                IsChainJump: true));

            _ = ApplyRangedDamageToMob(
                state,
                currentTarget,
                ArenaConfig.SkillConfig.VelvetVoidChainDamage,
                ArenaConfig.SkillIds.VelvetVoidChain,
                events,
                emitProjectileEvent: false,
                projectilePierces: true,
                projectileFromTile: fromTile,
                onSuccessfulHit: hitMob =>
                {
                    ApplyVelvetCorrosion(hitMob);
                    events.Add(new CorrosionUpdatedEventDto(MobId: hitMob.ActorId, StackCount: hitMob.CorrosionStacks));
                },
                finalDamageMultiplierResolver: ResolveVelvetCorrosionDamageMultiplier);
            hitAnyTarget = true;

            if (!TryResolveNextVelvetVoidChainTarget(state, currentTarget, hitSet, out var nextTarget))
            {
                break;
            }

            fromTile = toTile;
            currentTarget = nextTarget;
        }

        return hitAnyTarget;
    }

    private static bool TryResolveNextVelvetVoidChainTarget(
        StoredBattle state,
        StoredActor fromTarget,
        IReadOnlySet<string> hitSet,
        out StoredActor nextTarget)
    {
        nextTarget = default!;

        var jumpRange = ArenaConfig.SkillConfig.VelvetVoidChainJumpRangeChebyshev;
        var candidate = state.Actors.Values
            .Where(actor =>
                string.Equals(actor.Kind, "mob", StringComparison.Ordinal) &&
                actor.Hp > 0 &&
                !hitSet.Contains(actor.ActorId) &&
                ComputeChebyshevDistance(actor, fromTarget.TileX, fromTarget.TileY) <= jumpRange)
            .OrderBy(actor => ComputeChebyshevDistance(actor, fromTarget.TileX, fromTarget.TileY))
            .ThenBy(actor => actor.ActorId, StringComparer.Ordinal)
            .FirstOrDefault();
        if (candidate is null)
        {
            return false;
        }

        nextTarget = candidate;
        return true;
    }

    private static bool TryExecuteVelvetUmbralPath(
        StoredBattle state,
        List<BattleEventDto> events,
        StoredActor player)
    {
        var target = ResolveAssistTarget(state);
        if (target is null)
        {
            return false;
        }

        var fromTile = new TilePos(player.TileX, player.TileY);
        var stepX = Math.Sign(target.TileX - player.TileX);
        var stepY = Math.Sign(target.TileY - player.TileY);
        if (stepX == 0 && stepY == 0)
        {
            return false;
        }

        state.PlayerFacingDirection = ResolveFacingDirectionFromStep(stepX, stepY, state.PlayerFacingDirection);
        var piercePath = BuildPiercePath(fromTile, stepX, stepY);
        if (piercePath.Count == 0)
        {
            return false;
        }

        var trailTiles = BuildVelvetUmbralPathTrailTiles(
            fromTile,
            piercePath,
            ArenaConfig.SkillConfig.VelvetUmbralPathTrailWidthRadius);
        AddDamagingHazardDecalZone(
            state,
            trailTiles,
            ArenaConfig.SkillConfig.VelvetUmbralPathTrailDurationMs,
            ArenaConfig.SkillConfig.VelvetUmbralPathTrailDamagePerTick,
            ArenaConfig.SkillIds.VelvetUmbralPath);

        events.Add(new RangedProjectileFiredEventDto(
            WeaponId: ArenaConfig.SkillIds.VelvetUmbralPath,
            FromTile: fromTile,
            ToTile: piercePath[piercePath.Count - 1],
            TargetActorId: null,
            Pierces: true));

        var splashTiles = new List<(int TileX, int TileY)>();
        var seenSplashTiles = new HashSet<(int TileX, int TileY)>();
        foreach (var tile in piercePath)
        {
            var aroundTile = BuildSquareTiles(
                    tile.X,
                    tile.Y,
                    ArenaConfig.SkillConfig.VelvetUmbralPathSplashRadius,
                    includeCenter: true)
                .Where(splashTile => IsInBounds(splashTile.TileX, splashTile.TileY));

            foreach (var splashTile in aroundTile)
            {
                if (!seenSplashTiles.Add((splashTile.TileX, splashTile.TileY)))
                {
                    continue;
                }

                splashTiles.Add((splashTile.TileX, splashTile.TileY));
            }
        }

        var splashTargets = ResolveMobIdsOnTiles(state, splashTiles)
            .ToList();
        foreach (var actorId in splashTargets)
        {
            if (!state.Actors.TryGetValue(actorId, out var splashTarget) || splashTarget.Hp <= 0)
            {
                continue;
            }

            _ = ApplyRangedDamageToMob(
                state,
                splashTarget,
                ArenaConfig.SkillConfig.VelvetUmbralPathImpactDamage,
                ArenaConfig.SkillIds.VelvetUmbralPath,
                events,
                emitProjectileEvent: false,
                projectilePierces: true,
                projectileFromTile: fromTile,
                onSuccessfulHit: hitMob =>
                {
                    ApplyVelvetCorrosion(hitMob);
                    events.Add(new CorrosionUpdatedEventDto(MobId: hitMob.ActorId, StackCount: hitMob.CorrosionStacks));
                },
                finalDamageMultiplierResolver: ResolveVelvetCorrosionDamageMultiplier);
        }

        return true;
    }

    private static string ResolveFacingDirectionFromStep(int stepX, int stepY, string currentFacingDirection)
    {
        return (stepX, stepY) switch
        {
            (0, -1) => ArenaConfig.FacingUp,
            (1, -1) => ArenaConfig.FacingUpRight,
            (1, 0) => ArenaConfig.FacingRight,
            (1, 1) => ArenaConfig.FacingDownRight,
            (0, 1) => ArenaConfig.FacingDown,
            (-1, 1) => ArenaConfig.FacingDownLeft,
            (-1, 0) => ArenaConfig.FacingLeft,
            (-1, -1) => ArenaConfig.FacingUpLeft,
            _ => currentFacingDirection
        };
    }

    private static IReadOnlyList<TilePos> BuildPiercePath(TilePos start, int stepX, int stepY)
    {
        if (stepX == 0 && stepY == 0)
        {
            return [];
        }

        var path = new List<TilePos>();
        var currentX = start.X + stepX;
        var currentY = start.Y + stepY;
        while (IsInBounds(currentX, currentY))
        {
            path.Add(new TilePos(currentX, currentY));
            currentX += stepX;
            currentY += stepY;
        }

        return path;
    }

    private static IReadOnlyList<TilePos> BuildVelvetUmbralPathTrailTiles(
        TilePos sourceTile,
        IReadOnlyList<TilePos> pathTiles,
        int widthRadius)
    {
        if (pathTiles.Count == 0)
        {
            return [];
        }

        var safeWidthRadius = Math.Max(0, widthRadius);
        var trailTiles = new List<TilePos>(pathTiles.Count * (safeWidthRadius + 1));
        var seenTiles = new HashSet<(int X, int Y)>();
        var previousTile = sourceTile;

        foreach (var pathTile in pathTiles)
        {
            var stepX = Math.Sign(pathTile.X - previousTile.X);
            var stepY = Math.Sign(pathTile.Y - previousTile.Y);
            if (stepX == 0 && stepY == 0)
            {
                previousTile = pathTile;
                continue;
            }

            var perpendicularX = Math.Sign(-stepY);
            var perpendicularY = Math.Sign(stepX);

            for (var offset = -safeWidthRadius; offset <= safeWidthRadius; offset += 1)
            {
                var tileX = pathTile.X + (perpendicularX * offset);
                var tileY = pathTile.Y + (perpendicularY * offset);
                if (!IsInBounds(tileX, tileY))
                {
                    continue;
                }

                if (!seenTiles.Add((tileX, tileY)))
                {
                    continue;
                }

                trailTiles.Add(new TilePos(tileX, tileY));
            }

            previousTile = pathTile;
        }

        return trailTiles;
    }

    private static bool TryExecuteVelvetDeathStrike(
        StoredBattle state,
        List<BattleEventDto> events,
        StoredActor player)
    {
        var target = ResolveRangedTarget(
            state,
            ArenaConfig.SkillConfig.VelvetDeathStrikeMaxRangeTilesChebyshev,
            requireLOS: false);
        if (target is null)
        {
            return false;
        }

        _ = ApplyRangedDamageToMob(
            state,
            target,
            ArenaConfig.SkillConfig.VelvetDeathStrikeBaseDamage,
            ArenaConfig.SkillIds.VelvetDeathStrike,
            events,
            emitProjectileEvent: true,
            projectilePierces: false,
            projectileFromTile: new TilePos(player.TileX, player.TileY),
            onSuccessfulHit: hitMob =>
            {
                ApplyVelvetCorrosion(hitMob);
                events.Add(new CorrosionUpdatedEventDto(MobId: hitMob.ActorId, StackCount: hitMob.CorrosionStacks));
            },
            finalDamageMultiplierResolver: ResolveVelvetCorrosionDamageMultiplier);
        return true;
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
        TilePos? projectileFromTile = null,
        Action<StoredActor>? onSuccessfulHit = null,
        Func<StoredActor, double>? finalDamageMultiplierResolver = null,
        bool isChainJump = false,
        bool isSilverTempestFollowUp = false,
        bool applyLifeLeech = true)
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
                Pierces: projectilePierces,
                IsChainJump: isChainJump,
                IsSilverTempestFollowUp: isSilverTempestFollowUp));
        }

        // Shared ranged damage path intentionally reuses the existing melee damage pipeline.
        // Pierce/ricochet behavior is weapon-specific and must be handled by the weapon implementation.
        var hpDamageApplied = ApplyDamageToMob(
            state,
            events,
            target,
            damage,
            GetPlayerBaseElement(state),
            attacker: player,
            onSuccessfulHit: onSuccessfulHit,
            finalDamageMultiplierResolver: finalDamageMultiplierResolver);

        if (applyLifeLeech)
        {
            ApplyPlayerLifeLeech(state, events, ComputeLifeLeechHeal(state, hpDamageApplied));
        }

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
            var destination = (TileX: mob.TileX + stepX, TileY: mob.TileY + stepY);
            if (!IsWalkableTile(state, mob, destination))
            {
                break;
            }

            mob.TileX = destination.TileX;
            mob.TileY = destination.TileY;
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
            .Where(actor => (actor.Kind == "mob" || actor.Kind == "boss") && actor.Hp > 0)
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
        events.Add(new AssistCastEventDto(ArenaConfig.ShotgunSkillId, ArenaConfig.AssistReasonAutoOffense, ArenaConfig.GetSkillDisplayName(ArenaConfig.ShotgunSkillId) ?? ArenaConfig.ShotgunSkillId));
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
                        (actor.Kind == "mob" || actor.Kind == "boss") &&
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
        events.Add(new AssistCastEventDto(ArenaConfig.VoidRicochetSkillId, ArenaConfig.AssistReasonAutoOffense, ArenaConfig.GetSkillDisplayName(ArenaConfig.VoidRicochetSkillId) ?? ArenaConfig.VoidRicochetSkillId));
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
        events.Add(new AssistCastEventDto(ArenaConfig.SigilBoltSkillId, ArenaConfig.AssistReasonAutoOffense, ArenaConfig.GetSkillDisplayName(ArenaConfig.SigilBoltSkillId) ?? ArenaConfig.SigilBoltSkillId));
        return true;
    }
}
