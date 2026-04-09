using KaezanArena.Api.Contracts.Battle;

namespace KaezanArena.Api.Battle;

public sealed partial class InMemoryBattleStore
{
    /// <summary>
    /// Main entry: check for boss spawn then run boss AI each tick.
    /// </summary>
    private static void TickBossSystem(StoredBattle state, List<BattleEventDto> events)
    {
        TrySpawnBoss(state, events);

        if (!state.BossSpawned)
        {
            return;
        }

        var boss = GetBossActor(state);
        if (boss is null || boss.Hp <= 0)
        {
            return;
        }

        var player = GetPlayerActor(state);
        if (player is null || player.Hp <= 0)
        {
            return;
        }

        TickBossMovement(state, boss, player);
        TickBossAutoAttack(state, events, boss, player);
        TickBossAbility(state, events, boss, player);
    }

    private static void TrySpawnBoss(StoredBattle state, List<BattleEventDto> events)
    {
        if (state.BossSpawned)
        {
            return;
        }

        var elapsedSeconds = GetElapsedMsForTick(state.Tick) / 1000.0;
        if (elapsedSeconds < ArenaConfig.BossConfig.SpawnTimeSeconds)
        {
            return;
        }

        var bossDef = ArenaConfig.BossConfig.TryResolveBossForZone(state.ZoneIndex);
        if (bossDef is null)
        {
            // No boss for this zone — mark spawned to avoid repeated checks
            state.BossSpawned = true;
            return;
        }

        var player = GetPlayerActor(state);
        if (player is null)
        {
            return;
        }

        // Find walkable tile furthest from player (Chebyshev distance)
        var spawnTile = FindFurthestWalkableTile(state, player.TileX, player.TileY);
        if (spawnTile is null)
        {
            return;
        }

        var bossActor = new StoredActor(
            actorId: bossDef.BossId,
            kind: "boss",
            mobType: null,
            isElite: false,
            buffSourceEliteId: null,
            facingDirection: ArenaConfig.FacingDown,
            tileX: spawnTile.Value.TileX,
            tileY: spawnTile.Value.TileY,
            hp: bossDef.Hp,
            maxHp: bossDef.Hp,
            shield: 0,
            maxShield: 0,
            mobSlotIndex: null);

        state.Actors[bossDef.BossId] = bossActor;
        state.BossSpawned = true;
        state.BossAttackCooldownRemainingMs = RollInitialAutoAttackCooldownMs(state, bossDef.AutoAttackCooldownMs);
        state.BossAbilityCooldownRemainingMs = bossDef.AbilityCooldownMs;
        state.BossMoveCooldownRemainingMs = ArenaConfig.BossConfig.BossMoveCooldownMs;
        state.MobSpawnPausedUntilMs = GetElapsedMsForTick(state.Tick) + ArenaConfig.BossConfig.SpawnPauseDurationMs;

        events.Add(new BossSpawnedEventDto(
            BossId: bossDef.BossId,
            DisplayName: bossDef.DisplayName,
            TileX: spawnTile.Value.TileX,
            TileY: spawnTile.Value.TileY));
    }

    private static (int TileX, int TileY)? FindFurthestWalkableTile(StoredBattle state, int fromX, int fromY)
    {
        var occupiedTiles = new HashSet<(int, int)>(
            state.Actors.Values.Select(a => (a.TileX, a.TileY)));

        (int TileX, int TileY)? best = null;
        var bestDist = -1;

        for (var y = 0; y < ArenaConfig.Height; y++)
        {
            for (var x = 0; x < ArenaConfig.Width; x++)
            {
                // Border tiles are walls — skip
                if (x == 0 || y == 0 || x == ArenaConfig.Width - 1 || y == ArenaConfig.Height - 1)
                {
                    continue;
                }

                if (occupiedTiles.Contains((x, y)))
                {
                    continue;
                }

                var dist = ComputeChebyshevDistance(fromX, fromY, x, y);
                if (dist > bestDist)
                {
                    bestDist = dist;
                    best = (x, y);
                }
            }
        }

        return best;
    }

    private static void TickBossMovement(StoredBattle state, StoredActor boss, StoredActor player)
    {
        state.BossMoveCooldownRemainingMs = Math.Max(0, state.BossMoveCooldownRemainingMs - StepDeltaMs);
        if (state.BossMoveCooldownRemainingMs > 0)
        {
            return;
        }

        state.BossMoveCooldownRemainingMs = ArenaConfig.BossConfig.BossMoveCooldownMs;

        var dist = ComputeChebyshevDistance(boss.TileX, boss.TileY, player.TileX, player.TileY);
        if (dist <= 1)
        {
            return;
        }

        // Step one tile toward the player
        var dx = Math.Sign(player.TileX - boss.TileX);
        var dy = Math.Sign(player.TileY - boss.TileY);

        // Try direct diagonal/cardinal move first, then fallback to horizontal then vertical
        int[][] moveCandidates =
        [
            [boss.TileX + dx, boss.TileY + dy],
            [boss.TileX + dx, boss.TileY],
            [boss.TileX,      boss.TileY + dy],
        ];

        foreach (var candidate in moveCandidates)
        {
            var nx = candidate[0];
            var ny = candidate[1];
            if (!IsInBounds(nx, ny) || (nx == 0 || ny == 0 || nx == ArenaConfig.Width - 1 || ny == ArenaConfig.Height - 1))
            {
                continue;
            }

            // Check not occupied (skip player tile)
            if (state.Actors.Values.Any(a => a.ActorId != boss.ActorId && a.TileX == nx && a.TileY == ny))
            {
                continue;
            }

            boss.TileX = nx;
            boss.TileY = ny;
            boss.FacingDirection = ResolveFacingDirectionTowardTile(boss.TileX, boss.TileY, player.TileX, player.TileY, boss.FacingDirection);
            return;
        }
    }

    private static void TickBossAutoAttack(StoredBattle state, List<BattleEventDto> events, StoredActor boss, StoredActor player)
    {
        state.BossAttackCooldownRemainingMs = Math.Max(0, state.BossAttackCooldownRemainingMs - StepDeltaMs);
        if (state.BossAttackCooldownRemainingMs > 0)
        {
            return;
        }

        var bossDef = ArenaConfig.BossConfig.TryResolveBossById(boss.ActorId);
        if (bossDef is null)
        {
            return;
        }

        var dist = ComputeChebyshevDistance(boss.TileX, boss.TileY, player.TileX, player.TileY);
        if (dist > 1)
        {
            return;
        }

        EmitAttackFx(
            state,
            events,
            CombatFxKind.MeleeSwing,
            fromActor: boss,
            toActor: player,
            elementType: bossDef.AttackElement,
            durationMs: ArenaConfig.MeleeSwingDurationMs);

        events.Add(new FxSpawnEventDto(
            FxId: ArenaConfig.HitSmallFxId,
            TileX: player.TileX,
            TileY: player.TileY,
            Layer: "hitFx",
            DurationMs: 620,
            Element: bossDef.AttackElement));

        var damage = RollDamageForAttacker(state, bossDef.AutoAttackDamage, boss);
        ApplyDamageToPlayer(
            state,
            events,
            player,
            damage,
            bossDef.AttackElement,
            attacker: boss,
            isRangedAutoAttack: false);

        state.BossAttackCooldownRemainingMs = bossDef.AutoAttackCooldownMs;
    }

    private static void TickBossAbility(StoredBattle state, List<BattleEventDto> events, StoredActor boss, StoredActor player)
    {
        state.BossAbilityCooldownRemainingMs = Math.Max(0, state.BossAbilityCooldownRemainingMs - StepDeltaMs);
        if (state.BossAbilityCooldownRemainingMs > 0)
        {
            return;
        }

        var bossDef = ArenaConfig.BossConfig.TryResolveBossById(boss.ActorId);
        if (bossDef is null)
        {
            return;
        }

        var dist = ComputeChebyshevDistance(boss.TileX, boss.TileY, player.TileX, player.TileY);
        if (dist > bossDef.AbilityRange)
        {
            return;
        }

        var abilityFired = bossDef.BossId switch
        {
            "boss:big_demon"   => TryFireBigDemonAbility(state, events, boss, player, bossDef),
            "boss:big_zombie"  => TryFireBigZombieAbility(state, events, boss, player, bossDef),
            "boss:necromancer" => TryFireNecromancerAbility(state, events, boss, player, bossDef),
            _                  => false
        };

        if (abilityFired)
        {
            state.BossAbilityCooldownRemainingMs = bossDef.AbilityCooldownMs;
        }
    }

    /// <summary>big_demon: AoE slam r=2 centered on boss tile.</summary>
    private static bool TryFireBigDemonAbility(
        StoredBattle state, List<BattleEventDto> events,
        StoredActor boss, StoredActor player, ArenaConfig.BossConfig.BossDef bossDef)
    {
        var affectedTiles = BuildSquareTiles(boss.TileX, boss.TileY, bossDef.AbilityRange, includeCenter: true)
            .Where(t => IsInBounds(t.TileX, t.TileY))
            .ToList();

        EmitFxForTiles(events, affectedTiles, bossDef.AbilityFxId, bossDef.AttackElement);

        if (affectedTiles.Any(t => t.TileX == player.TileX && t.TileY == player.TileY))
        {
            ApplyDamageToPlayer(
                state, events, player,
                bossDef.AbilityDamage,
                bossDef.AttackElement,
                attacker: boss,
                isRangedAutoAttack: false);
        }

        return true;
    }

    /// <summary>big_zombie: Plague AoE r=2 + spawn 2 MeleeTinyZombies on adjacent tiles.</summary>
    private static bool TryFireBigZombieAbility(
        StoredBattle state, List<BattleEventDto> events,
        StoredActor boss, StoredActor player, ArenaConfig.BossConfig.BossDef bossDef)
    {
        var affectedTiles = BuildSquareTiles(boss.TileX, boss.TileY, bossDef.AbilityRange, includeCenter: true)
            .Where(t => IsInBounds(t.TileX, t.TileY))
            .ToList();

        EmitFxForTiles(events, affectedTiles, bossDef.AbilityFxId, bossDef.AttackElement);

        if (affectedTiles.Any(t => t.TileX == player.TileX && t.TileY == player.TileY))
        {
            ApplyDamageToPlayer(
                state, events, player,
                bossDef.AbilityDamage,
                bossDef.AttackElement,
                attacker: boss,
                isRangedAutoAttack: false);
        }

        // Spawn 2 MeleeTinyZombies on free adjacent tiles
        var spawned = 0;
        for (var dy = -1; dy <= 1 && spawned < 2; dy++)
        {
            for (var dx = -1; dx <= 1 && spawned < 2; dx++)
            {
                if (dx == 0 && dy == 0) continue;
                var tx = boss.TileX + dx;
                var ty = boss.TileY + dy;
                if (!IsInBounds(tx, ty)) continue;
                if (tx == 0 || ty == 0 || tx == ArenaConfig.Width - 1 || ty == ArenaConfig.Height - 1) continue;
                if (state.Actors.Values.Any(a => a.TileX == tx && a.TileY == ty)) continue;

                // Find a free mob slot or create a temp actor outside the slot system
                var zombieActorId = $"boss_zombie_{state.Tick}_{spawned}";
                var zombieConfig = GetMobConfig(MobArchetype.MeleeTinyZombie);
                var scaledHp = ResolveScaledMobMaxHp(state, zombieConfig, isElite: false);
                var zombie = new StoredActor(
                    actorId: zombieActorId,
                    kind: "mob",
                    mobType: MobArchetype.MeleeTinyZombie,
                    isElite: false,
                    buffSourceEliteId: null,
                    facingDirection: ArenaConfig.FacingDown,
                    tileX: tx,
                    tileY: ty,
                    hp: scaledHp,
                    maxHp: scaledHp,
                    shield: 0,
                    maxShield: 0,
                    mobSlotIndex: null);
                state.Actors[zombieActorId] = zombie;
                spawned++;
            }
        }

        return true;
    }

    /// <summary>necromancer: Fires 4 projectiles in cardinal directions simultaneously.</summary>
    private static bool TryFireNecromancerAbility(
        StoredBattle state, List<BattleEventDto> events,
        StoredActor boss, StoredActor player, ArenaConfig.BossConfig.BossDef bossDef)
    {
        var cardinals = new[] { (0, -1), (1, 0), (0, 1), (-1, 0) }; // N, E, S, W
        var nowMs = GetElapsedMsForTick(state.Tick);

        foreach (var (cdx, cdy) in cardinals)
        {
            // Walk the projectile path until it hits the boundary or player
            var tx = boss.TileX + cdx;
            var ty = boss.TileY + cdy;
            var endX = tx;
            var endY = ty;
            var hitPlayer = false;

            for (var step = 1; step <= bossDef.AbilityRange; step++)
            {
                var px = boss.TileX + cdx * step;
                var py = boss.TileY + cdy * step;
                if (!IsInBounds(px, py)) break;
                endX = px;
                endY = py;
                if (px == player.TileX && py == player.TileY)
                {
                    hitPlayer = true;
                    break;
                }
            }

            events.Add(new RangedProjectileFiredEventDto(
                WeaponId: bossDef.AbilityFxId,
                FromTile: new TilePos(boss.TileX, boss.TileY),
                ToTile: new TilePos(endX, endY),
                TargetActorId: hitPlayer ? player.ActorId : null,
                Pierces: false));

            events.Add(new FxSpawnEventDto(
                FxId: ArenaConfig.HitSmallFxId,
                TileX: endX,
                TileY: endY,
                Layer: "hitFx",
                DurationMs: 400,
                Element: bossDef.AttackElement));

            if (hitPlayer)
            {
                ApplyDamageToPlayer(
                    state, events, player,
                    bossDef.AbilityDamage,
                    bossDef.AttackElement,
                    attacker: boss,
                    isRangedAutoAttack: true);
            }
        }

        return true;
    }

    private static StoredActor? GetBossActor(StoredBattle state)
    {
        return state.Actors.Values.FirstOrDefault(actor => actor.Kind == "boss");
    }

    /// <summary>Called when the boss's HP reaches 0 (death handling).</summary>
    private static void OnBossDeath(StoredBattle state, List<BattleEventDto> events, StoredActor boss)
    {
        var bossDef = ArenaConfig.BossConfig.TryResolveBossById(boss.ActorId);
        var displayName = bossDef?.DisplayName ?? boss.ActorId;

        EmitDeathEvent(state, events, boss, bossDef?.AttackElement ?? ElementType.Physical, killerEntityId: null, entityTypeOverride: "boss");

        events.Add(new BossDefeatedEventDto(
            BossId: boss.ActorId,
            DisplayName: displayName));

        state.Actors.Remove(boss.ActorId);
        EndRun(state, events, ArenaConfig.RunEndReasonVictoryBoss);
    }
}
