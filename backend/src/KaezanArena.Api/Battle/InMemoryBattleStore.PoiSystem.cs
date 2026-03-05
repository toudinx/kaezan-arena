using KaezanArena.Api.Contracts.Battle;

namespace KaezanArena.Api.Battle;

public sealed partial class InMemoryBattleStore
{
    private static Dictionary<string, StoredPoi> BuildInitialPois()
    {
        return new Dictionary<string, StoredPoi>(StringComparer.Ordinal)
        {
            [InitialChestPoiId] = new StoredPoi(
                poiId: InitialChestPoiId,
                type: PoiTypeChest,
                tileX: ArenaConfig.PlayerTileX + 1,
                tileY: ArenaConfig.PlayerTileY,
                expiresAtMs: ChestLifetimeMs,
                species: null,
                metadata: null)
        };
    }

    private static bool TryExecutePoiInteraction(
        StoredBattle state,
        List<BattleEventDto> events,
        string? rawPoiId,
        out string? failReason)
    {
        failReason = null;
        var normalizedPoiId = NormalizePoiId(rawPoiId);
        if (normalizedPoiId is null)
        {
            failReason = UnknownPoiReason;
            events.Add(new InteractFailedEventDto(null, UnknownPoiReason));
            return false;
        }

        var player = GetPlayerActor(state);
        if (player is null || player.Hp <= 0)
        {
            failReason = PlayerDeadReason;
            events.Add(new InteractFailedEventDto(normalizedPoiId, PlayerDeadReason));
            return false;
        }

        if (!state.Pois.TryGetValue(normalizedPoiId, out var poi))
        {
            failReason = UnknownPoiReason;
            events.Add(new InteractFailedEventDto(normalizedPoiId, UnknownPoiReason));
            return false;
        }

        var nowMs = GetElapsedMsForTick(state.Tick);
        if (poi.ExpiresAtMs <= nowMs)
        {
            state.Pois.Remove(normalizedPoiId);
            failReason = UnknownPoiReason;
            events.Add(new InteractFailedEventDto(normalizedPoiId, UnknownPoiReason));
            return false;
        }

        if (string.Equals(poi.Type, PoiTypeAltar, StringComparison.Ordinal) &&
            nowMs < state.NextAltarInteractAllowedAtMs)
        {
            failReason = CooldownReason;
            events.Add(new InteractFailedEventDto(normalizedPoiId, CooldownReason));
            return false;
        }

        var distance = ComputeChebyshevDistance(player.TileX, player.TileY, poi.TileX, poi.TileY);
        if (distance > 1)
        {
            failReason = OutOfRangeReason;
            events.Add(new InteractFailedEventDto(normalizedPoiId, OutOfRangeReason));
            return false;
        }

        state.Pois.Remove(normalizedPoiId);
        events.Add(new PoiInteractedEventDto(
            PoiId: poi.PoiId,
            PoiType: poi.Type,
            TileX: poi.TileX,
            TileY: poi.TileY));

        if (string.Equals(poi.Type, PoiTypeChest, StringComparison.Ordinal) ||
            string.Equals(poi.Type, PoiTypeSpeciesChest, StringComparison.Ordinal))
        {
            state.ChestsOpened += 1;
            TryOfferCardChoice(state, events);
        }
        else if (string.Equals(poi.Type, PoiTypeAltar, StringComparison.Ordinal))
        {
            state.NextAltarInteractAllowedAtMs = nowMs + AltarCooldownMs;
            var spawnedCount = SummonMobsAroundPlayer(state, AltarSummonSpawnCount, events);
            events.Add(new AltarActivatedEventDto(
                RequestedCount: AltarSummonSpawnCount,
                SpawnedCount: spawnedCount));
        }

        TrySpawnPendingSpeciesChest(state, events, nowMs);

        return true;
    }

    private static int SummonMobsAroundPlayer(StoredBattle state, int requestedCount, List<BattleEventDto> events)
    {
        if (requestedCount <= 0)
        {
            return 0;
        }

        var availableSlots = state.MobSlots.Values
            .Where(slot => !state.Actors.ContainsKey(slot.ActorId))
            .OrderBy(slot => slot.SlotIndex)
            .ToList();
        if (availableSlots.Count == 0)
        {
            return 0;
        }

        var targetCount = Math.Min(requestedCount, availableSlots.Count);
        var spawnedCount = 0;
        for (var index = 0; index < targetCount; index += 1)
        {
            var slot = availableSlots[index];
            slot.RespawnRemainingMs = 0;
            if (!TrySpawnMobInSlot(state, slot, events))
            {
                break;
            }

            spawnedCount += 1;
        }

        return spawnedCount;
    }

    private static void TickPois(StoredBattle state, List<BattleEventDto> events)
    {
        var nowMs = GetElapsedMsForTick(state.Tick);
        if (state.Pois.Count > 0)
        {
            var expiredPoiIds = state.Pois.Values
                .Where(poi => poi.ExpiresAtMs <= nowMs)
                .Select(poi => poi.PoiId)
                .ToList();
            foreach (var poiId in expiredPoiIds)
            {
                state.Pois.Remove(poiId);
            }
        }

        TrySpawnPendingSpeciesChest(state, events, nowMs);

        // Chest spawn checks run on a fixed simulation cadence to keep outcomes deterministic.
        while (nowMs >= state.NextChestSpawnCheckAtMs)
        {
            TrySpawnChestPoi(state, state.NextChestSpawnCheckAtMs);
            state.NextChestSpawnCheckAtMs += ChestSpawnCheckMs;
        }

        // Altar checks run after chest checks to keep POI ordering deterministic.
        while (nowMs >= state.NextAltarSpawnCheckAtMs)
        {
            TrySpawnAltarPoi(state, state.NextAltarSpawnCheckAtMs);
            state.NextAltarSpawnCheckAtMs += AltarSpawnCheckMs;
        }
    }

    private static void TickBuffs(StoredBattle state)
    {
        if (state.ActiveBuffs.Count == 0)
        {
            return;
        }

        var nowMs = GetElapsedMsForTick(state.Tick);
        var expiredBuffIds = state.ActiveBuffs.Values
            .Where(buff => buff.ExpiresAtMs <= nowMs)
            .Select(buff => buff.BuffId)
            .ToList();
        foreach (var buffId in expiredBuffIds)
        {
            state.ActiveBuffs.Remove(buffId);
        }
    }

    private static void TrySpawnChestPoi(StoredBattle state, long checkAtMs)
    {
        if (state.PendingSpeciesChestArchetype is not null)
        {
            return;
        }

        if (HasAnyActiveChestPoi(state, checkAtMs))
        {
            return;
        }

        if (state.PoiRng.Next(100) >= ChestSpawnChancePercent)
        {
            return;
        }

        var freeTiles = BuildPoiSpawnTiles(state, checkAtMs);
        if (freeTiles.Count == 0)
        {
            return;
        }

        var tileIndex = state.PoiRng.Next(freeTiles.Count);
        var tile = freeTiles[tileIndex];
        var poiId = BuildChestPoiId(state.NextPoiSequence);
        state.NextPoiSequence += 1;
        state.Pois[poiId] = new StoredPoi(
            poiId: poiId,
            type: PoiTypeChest,
            tileX: tile.TileX,
            tileY: tile.TileY,
            expiresAtMs: checkAtMs + ChestLifetimeMs,
            species: null,
            metadata: null);
    }

    private static void TrySpawnAltarPoi(StoredBattle state, long checkAtMs)
    {
        if (HasActiveAltarPoi(state, checkAtMs))
        {
            return;
        }

        if (state.Rng.Next(100) >= AltarSpawnChancePercent)
        {
            return;
        }

        var freeTiles = BuildPoiSpawnTiles(state, checkAtMs);
        if (freeTiles.Count == 0)
        {
            return;
        }

        var tileIndex = state.Rng.Next(freeTiles.Count);
        var tile = freeTiles[tileIndex];
        var poiId = BuildAltarPoiId(state.NextPoiSequence);
        state.NextPoiSequence += 1;
        state.Pois[poiId] = new StoredPoi(
            poiId: poiId,
            type: PoiTypeAltar,
            tileX: tile.TileX,
            tileY: tile.TileY,
            expiresAtMs: checkAtMs + AltarLifetimeMs,
            species: null,
            metadata: null);
    }

    private static void TrySpawnPendingSpeciesChest(
        StoredBattle state,
        List<BattleEventDto> events,
        long nowMs)
    {
        if (state.PendingSpeciesChestArchetype is not MobArchetype archetype)
        {
            return;
        }

        if (HasAnyActiveChestPoi(state, nowMs))
        {
            return;
        }

        if (TrySpawnSpeciesChestPoi(state, events, archetype, nowMs))
        {
            state.PendingSpeciesChestArchetype = null;
        }
    }

    private static bool TrySpawnSpeciesChestPoi(
        StoredBattle state,
        List<BattleEventDto> events,
        MobArchetype speciesArchetype,
        long spawnAtMs)
    {
        var freeTiles = BuildPoiSpawnTiles(state, spawnAtMs);
        if (freeTiles.Count == 0)
        {
            return false;
        }

        var tileIndex = state.PoiRng.Next(freeTiles.Count);
        var tile = freeTiles[tileIndex];
        var poiId = BuildSpeciesChestPoiId(state.NextPoiSequence);
        state.NextPoiSequence += 1;
        var species = GetSpeciesId(speciesArchetype);
        state.Pois[poiId] = new StoredPoi(
            poiId: poiId,
            type: PoiTypeSpeciesChest,
            tileX: tile.TileX,
            tileY: tile.TileY,
            expiresAtMs: spawnAtMs + SpeciesChestLifetimeMs,
            species: species,
            metadata: null);
        events.Add(new SpeciesChestSpawnedEventDto(
            Species: species,
            PoiId: poiId,
            TileX: tile.TileX,
            TileY: tile.TileY));
        return true;
    }

    private static bool HasActiveChestPoi(StoredBattle state, long nowMs)
    {
        return state.Pois.Values.Any(poi =>
            IsChestPoiType(poi.Type) &&
            poi.ExpiresAtMs > nowMs);
    }

    private static bool HasAnyActiveChestPoi(StoredBattle state, long nowMs)
    {
        return HasActiveChestPoi(state, nowMs);
    }

    private static bool HasActiveAltarPoi(StoredBattle state, long nowMs)
    {
        return state.Pois.Values.Any(poi =>
            string.Equals(poi.Type, PoiTypeAltar, StringComparison.Ordinal) &&
            poi.ExpiresAtMs > nowMs);
    }

    private static List<(int TileX, int TileY)> BuildPoiSpawnTiles(StoredBattle state, long nowMs)
    {
        var occupiedActorTiles = new HashSet<(int TileX, int TileY)>(
            state.Actors.Values.Select(actor => (actor.TileX, actor.TileY)));
        var occupiedPoiTiles = new HashSet<(int TileX, int TileY)>(
            state.Pois.Values
                .Where(poi => poi.ExpiresAtMs > nowMs)
                .Select(poi => (poi.TileX, poi.TileY)));

        var freeTiles = new List<(int TileX, int TileY)>();
        for (var y = 0; y < ArenaConfig.Height; y += 1)
        {
            for (var x = 0; x < ArenaConfig.Width; x += 1)
            {
                if (occupiedActorTiles.Contains((x, y)) || occupiedPoiTiles.Contains((x, y)))
                {
                    continue;
                }

                freeTiles.Add((x, y));
            }
        }

        return freeTiles;
    }

    private static string BuildChestPoiId(int sequence)
    {
        return $"poi.chest.{sequence:D4}";
    }

    private static string BuildSpeciesChestPoiId(int sequence)
    {
        return $"poi.species_chest.{sequence:D4}";
    }

    private static string BuildAltarPoiId(int sequence)
    {
        return $"poi.altar.{sequence:D4}";
    }

    private static bool IsChestPoiType(string poiType)
    {
        return string.Equals(poiType, PoiTypeChest, StringComparison.Ordinal) ||
               string.Equals(poiType, PoiTypeSpeciesChest, StringComparison.Ordinal);
    }
}
