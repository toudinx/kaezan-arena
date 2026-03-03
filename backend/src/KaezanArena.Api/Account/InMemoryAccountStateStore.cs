using System.Collections.Concurrent;

namespace KaezanArena.Api.Account;

public sealed class InMemoryAccountStateStore : IAccountStateStore
{
    private const int EchoFragmentsPerMobKill = 1;
    private const int BestiaryCraftPrimalCoreCost = 20;
    private const int BestiaryCraftEchoFragmentsCost = 100;
    private const int RefineCommonToRarePrimalCoreCost = 40;
    private const int RefineCommonToRareEchoFragmentsCost = 200;
    private const int RefineRareToEpicPrimalCoreCost = 120;
    private const int RefineRareToEpicEchoFragmentsCost = 500;
    private const int RefineEpicToLegendaryPrimalCoreCost = 300;
    private const int RefineEpicToLegendaryEchoFragmentsCost = 1000;
    private const int SalvageCommonPrimalCoreReturn = 12;
    private const int SalvageRarePrimalCoreReturn = 28;
    private const int SalvageEpicPrimalCoreReturn = 96;
    private const int SalvageLegendaryPrimalCoreReturn = 250;
    private const int AscendantBaseDropChancePpm = 200;
    private const int AscendantBonusPer100KillsPpm = 100;
    private const int AscendantDropChanceCapPpm = 2000;
    private const int PpmScale = 1_000_000;
    private const string CraftedRarityCommon = "common";
    private const string CraftedRarityAscendant = "ascendant";
    private const string RewardKindItem = "item";
    private const string RewardKindEchoFragments = "echo_fragments";
    private const string RewardKindPrimalCore = "primal_core";
    private const string EchoFragmentsItemId = "currency.echo_fragments";
    private const string UnknownSpeciesId = "unknown_species";
    private readonly ConcurrentDictionary<string, StoredAccount> _accounts = new(StringComparer.Ordinal);

    public AccountState GetAccountState(string accountId)
    {
        var account = GetOrCreateAccount(accountId);
        lock (account.Sync)
        {
            return CloneAccountState(account.State);
        }
    }

    public AccountState SetActiveCharacter(string accountId, string characterId)
    {
        var account = GetOrCreateAccount(accountId);
        lock (account.Sync)
        {
            if (!account.State.Characters.ContainsKey(characterId))
            {
                throw new InvalidOperationException($"Character '{characterId}' was not found.");
            }

            if (!string.Equals(account.State.ActiveCharacterId, characterId, StringComparison.Ordinal))
            {
                account.State = account.State with
                {
                    ActiveCharacterId = characterId,
                    Version = account.State.Version + 1
                };
            }

            return CloneAccountState(account.State);
        }
    }

    public CharacterState EquipItem(string accountId, string characterId, EquipmentSlot slot, string equipmentInstanceId)
    {
        var account = GetOrCreateAccount(accountId);
        lock (account.Sync)
        {
            var character = GetCharacterOrThrow(account.State, characterId);
            if (!character.Inventory.EquipmentInstances.TryGetValue(equipmentInstanceId, out var equipmentInstance))
            {
                throw new InvalidOperationException($"Character '{characterId}' does not own equipment instance '{equipmentInstanceId}'.");
            }

            if (!AccountCatalog.TryGetEquipment(equipmentInstance.DefinitionId, out var equipmentDefinition))
            {
                throw new InvalidOperationException($"Equipment definition '{equipmentInstance.DefinitionId}' was not found.");
            }

            if (!EquipmentSlotMapper.TryFromCatalogSlot(equipmentDefinition.Slot, out var definitionSlot))
            {
                throw new InvalidOperationException($"Equipment definition '{equipmentDefinition.ItemId}' has an unsupported slot '{equipmentDefinition.Slot}'.");
            }

            if (definitionSlot != slot)
            {
                throw new InvalidOperationException(
                    $"Equipment instance '{equipmentInstanceId}' cannot be equipped in '{EquipmentSlotMapper.ToCatalogSlot(slot)}'.");
            }

            var updatedCharacter = character with
            {
                Equipment = character.Equipment.SetInstanceId(slot, equipmentInstanceId)
            };

            account.State = UpdateCharacter(account.State, updatedCharacter, versionIncrement: 1);
            return CloneCharacterState(updatedCharacter);
        }
    }

    public CharacterState EquipWeapon(string accountId, string characterId, string weaponInstanceId)
    {
        return EquipItem(accountId, characterId, EquipmentSlot.Weapon, weaponInstanceId);
    }

    public AwardDropsResult AwardDrops(string accountId, string characterId, string battleId, IReadOnlyList<DropSource> sources, int? battleSeed = null)
    {
        var account = GetOrCreateAccount(accountId);
        lock (account.Sync)
        {
            var character = GetCharacterOrThrow(account.State, characterId);
            var equipmentInstances = new Dictionary<string, OwnedEquipmentInstance>(character.Inventory.EquipmentInstances, StringComparer.Ordinal);
            var bestiaryKillsBySpecies = new Dictionary<string, int>(character.BestiaryKillsBySpecies, StringComparer.Ordinal);
            var primalCoreBySpecies = new Dictionary<string, int>(character.PrimalCoreBySpecies, StringComparer.Ordinal);
            var echoFragmentsBalance = account.State.EchoFragmentsBalance;
            var awarded = new List<DropEvent>();

            if (!account.AwardedBySourceKeyByCharacter.TryGetValue(characterId, out var alreadyAwardedBySourceKey))
            {
                alreadyAwardedBySourceKey = new Dictionary<string, IReadOnlyList<DropEvent>>(StringComparer.Ordinal);
                account.AwardedBySourceKeyByCharacter[characterId] = alreadyAwardedBySourceKey;
            }

            var changed = false;
            foreach (var source in sources)
            {
                var sourceKey = BuildSourceKey(battleId, source.Tick, source.SourceType, source.SourceId);
                if (alreadyAwardedBySourceKey.TryGetValue(sourceKey, out var existingEvents))
                {
                    awarded.AddRange(existingEvents);
                    continue;
                }

                var killsTotalForSpecies = 0;
                if (IsMobSourceType(source.SourceType))
                {
                    var normalizedSpecies = NormalizeSpecies(source.Species);
                    killsTotalForSpecies = bestiaryKillsBySpecies.GetValueOrDefault(normalizedSpecies, 0) + 1;
                }

                var rolledEvents = RollDrops(
                    accountId: account.State.AccountId,
                    characterId: characterId,
                    battleId: battleId,
                    source: source,
                    sourceKey: sourceKey,
                    equipmentInstances: equipmentInstances,
                    battleSeed: battleSeed,
                    killsTotalForSpecies: killsTotalForSpecies);

                alreadyAwardedBySourceKey[sourceKey] = rolledEvents;
                awarded.AddRange(rolledEvents);
                if (IsMobSourceType(source.SourceType))
                {
                    var normalizedSpecies = NormalizeSpecies(source.Species);
                    echoFragmentsBalance += ResolveEchoFragmentsAward(source.SourceType, source.Species);
                    IncrementSpeciesCounter(bestiaryKillsBySpecies, normalizedSpecies, amount: 1);
                    IncrementSpeciesCounter(primalCoreBySpecies, normalizedSpecies, amount: 1);
                }

                changed = true;
            }

            if (changed)
            {
                var updatedCharacter = character with
                {
                    Inventory = new CharacterInventory(
                        MaterialStacks: new Dictionary<string, long>(character.Inventory.MaterialStacks, StringComparer.Ordinal),
                        EquipmentInstances: new Dictionary<string, OwnedEquipmentInstance>(equipmentInstances, StringComparer.Ordinal)),
                    BestiaryKillsBySpecies = new Dictionary<string, int>(bestiaryKillsBySpecies, StringComparer.Ordinal),
                    PrimalCoreBySpecies = new Dictionary<string, int>(primalCoreBySpecies, StringComparer.Ordinal)
                };

                account.State = UpdateAccountAfterDropAward(account.State, updatedCharacter, echoFragmentsBalance);
                character = updatedCharacter;
            }

            return new AwardDropsResult(
                Awarded: awarded,
                Character: CloneCharacterState(character));
        }
    }

    public BestiaryCraftResult CraftBestiaryItem(string accountId, string speciesId, EquipmentSlot slot)
    {
        var account = GetOrCreateAccount(accountId);
        lock (account.Sync)
        {
            if (string.IsNullOrWhiteSpace(speciesId))
            {
                throw new InvalidOperationException("speciesId is required.");
            }

            var normalizedSpeciesId = NormalizeSpecies(speciesId);
            if (!AccountCatalog.SpeciesDefinitions.Any(definition =>
                    string.Equals(definition.SpeciesId, normalizedSpeciesId, StringComparison.Ordinal)))
            {
                throw new InvalidOperationException($"Unknown speciesId '{speciesId}'.");
            }

            if (!account.State.Characters.TryGetValue(account.State.ActiveCharacterId, out var character))
            {
                throw new InvalidOperationException($"Character '{account.State.ActiveCharacterId}' was not found.");
            }

            var primalCoreBySpecies = new Dictionary<string, int>(character.PrimalCoreBySpecies, StringComparer.Ordinal);
            var primalCoreBalance = primalCoreBySpecies.GetValueOrDefault(normalizedSpeciesId, 0);
            if (primalCoreBalance < BestiaryCraftPrimalCoreCost)
            {
                throw new InvalidOperationException(
                    $"Not enough Primal Core for species '{normalizedSpeciesId}'. Required {BestiaryCraftPrimalCoreCost}, current {primalCoreBalance}.");
            }

            if (account.State.EchoFragmentsBalance < BestiaryCraftEchoFragmentsCost)
            {
                throw new InvalidOperationException(
                    $"Not enough Echo Fragments. Required {BestiaryCraftEchoFragmentsCost}, current {account.State.EchoFragmentsBalance}.");
            }

            var craftedItemDefinitionId = AccountCatalog.ResolveCraftedCommonEquipmentItemId(slot);
            var slotLabel = EquipmentSlotMapper.ToCatalogSlot(slot);
            var sameCraftedCount = character.Inventory.EquipmentInstances.Values
                .Count(instance =>
                    string.Equals(instance.OriginSpeciesId, normalizedSpeciesId, StringComparison.Ordinal) &&
                    string.Equals(instance.Slot, slotLabel, StringComparison.Ordinal));
            var craftedSequence = sameCraftedCount + 1;
            var craftedInstanceId = DeterministicSeed.HashId(
                "craft",
                account.State.AccountId,
                character.CharacterId,
                normalizedSpeciesId,
                slotLabel,
                craftedSequence.ToString());
            var craftedItem = new OwnedEquipmentInstance(
                InstanceId: craftedInstanceId,
                DefinitionId: craftedItemDefinitionId,
                IsLocked: false,
                OriginSpeciesId: normalizedSpeciesId,
                Slot: slotLabel,
                Rarity: CraftedRarityCommon);

            var equipmentInstances = new Dictionary<string, OwnedEquipmentInstance>(character.Inventory.EquipmentInstances, StringComparer.Ordinal)
            {
                [craftedInstanceId] = craftedItem
            };
            primalCoreBySpecies[normalizedSpeciesId] = primalCoreBalance - BestiaryCraftPrimalCoreCost;

            var updatedCharacter = character with
            {
                Inventory = new CharacterInventory(
                    MaterialStacks: new Dictionary<string, long>(character.Inventory.MaterialStacks, StringComparer.Ordinal),
                    EquipmentInstances: equipmentInstances),
                PrimalCoreBySpecies = primalCoreBySpecies
            };

            var updatedEchoFragmentsBalance = account.State.EchoFragmentsBalance - BestiaryCraftEchoFragmentsCost;
            account.State = UpdateAccountAfterDropAward(account.State, updatedCharacter, updatedEchoFragmentsBalance);
            return new BestiaryCraftResult(
                Account: CloneAccountState(account.State),
                Character: CloneCharacterState(updatedCharacter),
                CraftedItem: craftedItem);
        }
    }

    public ItemRefineResult RefineItem(string accountId, string itemInstanceId)
    {
        var account = GetOrCreateAccount(accountId);
        lock (account.Sync)
        {
            if (string.IsNullOrWhiteSpace(itemInstanceId))
            {
                throw new InvalidOperationException("itemInstanceId is required.");
            }

            if (!account.State.Characters.TryGetValue(account.State.ActiveCharacterId, out var character))
            {
                throw new InvalidOperationException($"Character '{account.State.ActiveCharacterId}' was not found.");
            }

            if (!character.Inventory.EquipmentInstances.TryGetValue(itemInstanceId, out var item))
            {
                throw new InvalidOperationException($"Character does not own item instance '{itemInstanceId}'.");
            }

            var normalizedSpecies = NormalizeSpeciesOrNull(item.OriginSpeciesId);
            if (normalizedSpecies is null)
            {
                throw new InvalidOperationException("Item is not linked to a species and cannot be refined.");
            }

            var currentRarity = ResolveItemRarity(item);
            if (string.Equals(currentRarity, "ascendant", StringComparison.Ordinal))
            {
                throw new InvalidOperationException("Ascendant items cannot be refined.");
            }

            var refineRule = ResolveRefineRuleOrThrow(currentRarity);
            var primalCoreBySpecies = new Dictionary<string, int>(character.PrimalCoreBySpecies, StringComparer.Ordinal);
            var primalCoreBalance = primalCoreBySpecies.GetValueOrDefault(normalizedSpecies, 0);
            if (primalCoreBalance < refineRule.PrimalCoreCost)
            {
                throw new InvalidOperationException(
                    $"Not enough Primal Core for species '{normalizedSpecies}'. Required {refineRule.PrimalCoreCost}, current {primalCoreBalance}.");
            }

            if (account.State.EchoFragmentsBalance < refineRule.EchoFragmentsCost)
            {
                throw new InvalidOperationException(
                    $"Not enough Echo Fragments. Required {refineRule.EchoFragmentsCost}, current {account.State.EchoFragmentsBalance}.");
            }

            primalCoreBySpecies[normalizedSpecies] = primalCoreBalance - refineRule.PrimalCoreCost;
            var updatedItem = item with
            {
                Rarity = refineRule.ToRarity
            };
            var equipmentInstances = new Dictionary<string, OwnedEquipmentInstance>(character.Inventory.EquipmentInstances, StringComparer.Ordinal)
            {
                [itemInstanceId] = updatedItem
            };

            var updatedCharacter = character with
            {
                Inventory = new CharacterInventory(
                    MaterialStacks: new Dictionary<string, long>(character.Inventory.MaterialStacks, StringComparer.Ordinal),
                    EquipmentInstances: equipmentInstances),
                PrimalCoreBySpecies = primalCoreBySpecies
            };

            var updatedEchoFragmentsBalance = account.State.EchoFragmentsBalance - refineRule.EchoFragmentsCost;
            account.State = UpdateAccountAfterDropAward(account.State, updatedCharacter, updatedEchoFragmentsBalance);
            return new ItemRefineResult(
                Account: CloneAccountState(account.State),
                Character: CloneCharacterState(updatedCharacter),
                RefinedItem: updatedItem);
        }
    }

    public ItemSalvageResult SalvageItem(string accountId, string itemInstanceId)
    {
        var account = GetOrCreateAccount(accountId);
        lock (account.Sync)
        {
            if (string.IsNullOrWhiteSpace(itemInstanceId))
            {
                throw new InvalidOperationException("itemInstanceId is required.");
            }

            if (!account.State.Characters.TryGetValue(account.State.ActiveCharacterId, out var character))
            {
                throw new InvalidOperationException($"Character '{account.State.ActiveCharacterId}' was not found.");
            }

            if (!character.Inventory.EquipmentInstances.TryGetValue(itemInstanceId, out var item))
            {
                throw new InvalidOperationException($"Character does not own item instance '{itemInstanceId}'.");
            }

            var normalizedSpecies = NormalizeSpeciesOrNull(item.OriginSpeciesId);
            if (normalizedSpecies is null)
            {
                throw new InvalidOperationException("Item is not linked to a species and cannot be salvaged.");
            }

            var itemRarity = ResolveItemRarity(item);
            var primalCoreAward = ResolveSalvagePrimalCoreOrThrow(itemRarity);
            var primalCoreBySpecies = new Dictionary<string, int>(character.PrimalCoreBySpecies, StringComparer.Ordinal);
            primalCoreBySpecies[normalizedSpecies] = primalCoreBySpecies.GetValueOrDefault(normalizedSpecies, 0) + primalCoreAward;

            var equipmentInstances = new Dictionary<string, OwnedEquipmentInstance>(character.Inventory.EquipmentInstances, StringComparer.Ordinal);
            if (!equipmentInstances.Remove(itemInstanceId))
            {
                throw new InvalidOperationException($"Character does not own item instance '{itemInstanceId}'.");
            }

            var updatedEquipment = character.Equipment;
            foreach (var slot in EquipmentState.OrderedSlots)
            {
                if (string.Equals(updatedEquipment.GetInstanceId(slot), itemInstanceId, StringComparison.Ordinal))
                {
                    updatedEquipment = updatedEquipment.SetInstanceId(slot, null);
                }
            }

            var updatedCharacter = character with
            {
                Inventory = new CharacterInventory(
                    MaterialStacks: new Dictionary<string, long>(character.Inventory.MaterialStacks, StringComparer.Ordinal),
                    EquipmentInstances: equipmentInstances),
                Equipment = updatedEquipment,
                PrimalCoreBySpecies = primalCoreBySpecies
            };

            account.State = UpdateCharacter(account.State, updatedCharacter, versionIncrement: 1);
            return new ItemSalvageResult(
                Account: CloneAccountState(account.State),
                Character: CloneCharacterState(updatedCharacter),
                SalvagedItemInstanceId: itemInstanceId,
                SpeciesId: normalizedSpecies,
                PrimalCoreAwarded: primalCoreAward);
        }
    }

    private static List<DropEvent> RollDrops(
        string accountId,
        string characterId,
        string battleId,
        DropSource source,
        string sourceKey,
        IDictionary<string, OwnedEquipmentInstance> equipmentInstances,
        int? battleSeed,
        int killsTotalForSpecies)
    {
        var normalizedSourceType = NormalizeSourceType(source.SourceType);
        var normalizedSpecies = NormalizeSpeciesOrNull(source.Species);
        var nowUtc = DateTimeOffset.UtcNow;
        var deterministicBattleSeedKey = battleSeed?.ToString() ?? battleId;
        var seed = DeterministicSeed.FromParts(
            "drops",
            deterministicBattleSeedKey,
            source.Tick.ToString(),
            normalizedSourceType,
            source.SourceId);
        var rng = new Random(seed);

        var events = new List<DropEvent>(capacity: 3);

        if (IsMobSourceType(normalizedSourceType))
        {
            var echoFragments = ResolveEchoFragmentsAward(normalizedSourceType, source.Species);
            if (echoFragments > 0)
            {
                events.Add(new DropEvent(
                    DropEventId: DeterministicSeed.HashId("dropevt", accountId, characterId, sourceKey, EchoFragmentsItemId, "echo"),
                    AccountId: accountId,
                    CharacterId: characterId,
                    BattleId: battleId,
                    Tick: source.Tick,
                    SourceType: normalizedSourceType,
                    SourceId: source.SourceId,
                    ItemId: EchoFragmentsItemId,
                    Quantity: echoFragments,
                    EquipmentInstanceId: null,
                    RewardKind: RewardKindEchoFragments,
                    Species: NormalizeSpecies(source.Species),
                    AwardedAtUtc: nowUtc));
            }

            var primalSpecies = NormalizeSpecies(source.Species);
            events.Add(new DropEvent(
                DropEventId: DeterministicSeed.HashId("dropevt", accountId, characterId, sourceKey, "primal_core", primalSpecies),
                AccountId: accountId,
                CharacterId: characterId,
                BattleId: battleId,
                Tick: source.Tick,
                SourceType: normalizedSourceType,
                SourceId: source.SourceId,
                ItemId: $"primal_core.{primalSpecies}",
                Quantity: 1,
                EquipmentInstanceId: null,
                RewardKind: RewardKindPrimalCore,
                Species: primalSpecies,
                AwardedAtUtc: nowUtc));
        }

        var chancePercent = AccountCatalog.ResolveEquipmentDropChancePercent(normalizedSourceType);
        if (rng.Next(100) < chancePercent)
        {
            var dropTable = AccountCatalog.ResolveEquipmentDropTable(normalizedSourceType);
            var entry = RollWeightedEntry(dropTable.Entries, rng);
            var quantity = Math.Clamp(entry.MinQuantity, 1, entry.MaxQuantity);
            var equipmentInstanceId = DeterministicSeed.HashId("eqinst", accountId, characterId, sourceKey, entry.ItemId, "0");
            var droppedSlot = AccountCatalog.TryGetEquipment(entry.ItemId, out var droppedEquipmentDefinition)
                ? droppedEquipmentDefinition.Slot.Trim().ToLowerInvariant()
                : null;
            var droppedRarity = AccountCatalog.TryGetItem(entry.ItemId, out var droppedItemDefinition)
                ? NormalizeRarity(droppedItemDefinition.Rarity)
                : null;
            equipmentInstances[equipmentInstanceId] = new OwnedEquipmentInstance(
                InstanceId: equipmentInstanceId,
                DefinitionId: entry.ItemId,
                IsLocked: false,
                OriginSpeciesId: null,
                Slot: droppedSlot,
                Rarity: droppedRarity);

            events.Add(new DropEvent(
                DropEventId: DeterministicSeed.HashId("dropevt", accountId, characterId, sourceKey, entry.ItemId, "1"),
                AccountId: accountId,
                CharacterId: characterId,
                BattleId: battleId,
                Tick: source.Tick,
                SourceType: normalizedSourceType,
                SourceId: source.SourceId,
                ItemId: entry.ItemId,
                Quantity: quantity,
                EquipmentInstanceId: equipmentInstanceId,
                RewardKind: RewardKindItem,
                Species: normalizedSpecies,
                AwardedAtUtc: nowUtc));
        }

        if (IsMobSourceType(normalizedSourceType))
        {
            var ascendantDropChancePpm = ResolveAscendantDropChancePpm(killsTotalForSpecies);
            if (ShouldDropByPpm(rng, ascendantDropChancePpm))
            {
                var ascendantSlot = RollRandomEquipmentSlot(rng);
                var ascendantItemId = AccountCatalog.ResolveAscendantEquipmentItemId(ascendantSlot);
                var ascendantSlotLabel = EquipmentSlotMapper.ToCatalogSlot(ascendantSlot);
                var ascendantSpecies = NormalizeSpecies(source.Species);
                var ascendantInstanceId = DeterministicSeed.HashId("eqinst", accountId, characterId, sourceKey, ascendantItemId, "asc");
                equipmentInstances[ascendantInstanceId] = new OwnedEquipmentInstance(
                    InstanceId: ascendantInstanceId,
                    DefinitionId: ascendantItemId,
                    IsLocked: false,
                    OriginSpeciesId: ascendantSpecies,
                    Slot: ascendantSlotLabel,
                    Rarity: CraftedRarityAscendant);

                events.Add(new DropEvent(
                    DropEventId: DeterministicSeed.HashId("dropevt", accountId, characterId, sourceKey, ascendantItemId, "asc"),
                    AccountId: accountId,
                    CharacterId: characterId,
                    BattleId: battleId,
                    Tick: source.Tick,
                    SourceType: normalizedSourceType,
                    SourceId: source.SourceId,
                    ItemId: ascendantItemId,
                    Quantity: 1,
                    EquipmentInstanceId: ascendantInstanceId,
                    RewardKind: RewardKindItem,
                    Species: ascendantSpecies,
                    AwardedAtUtc: nowUtc));
            }
        }

        return events;
    }

    private static DropEntry RollWeightedEntry(IReadOnlyList<DropEntry> entries, Random rng)
    {
        if (entries.Count == 0)
        {
            throw new InvalidOperationException("Drop table has no entries.");
        }

        var totalWeight = entries.Sum(entry => Math.Max(0, entry.Weight));
        if (totalWeight <= 0)
        {
            throw new InvalidOperationException("Drop table has invalid total weight.");
        }

        var roll = rng.Next(totalWeight);
        var cumulative = 0;
        foreach (var entry in entries)
        {
            cumulative += Math.Max(0, entry.Weight);
            if (roll < cumulative)
            {
                return entry;
            }
        }

        return entries[^1];
    }

    private static int ResolveAscendantDropChancePpm(int killsTotalForSpecies)
    {
        var nonNegativeKills = Math.Max(0, killsTotalForSpecies);
        var bonusSteps = nonNegativeKills / 100;
        var rawChance = AscendantBaseDropChancePpm + (bonusSteps * AscendantBonusPer100KillsPpm);
        return Math.Min(AscendantDropChanceCapPpm, rawChance);
    }

    private static bool ShouldDropByPpm(Random rng, int chancePpm)
    {
        if (chancePpm <= 0)
        {
            return false;
        }

        if (chancePpm >= PpmScale)
        {
            return true;
        }

        return rng.Next(PpmScale) < chancePpm;
    }

    private static EquipmentSlot RollRandomEquipmentSlot(Random rng)
    {
        var roll = rng.Next(EquipmentState.OrderedSlots.Count);
        return EquipmentState.OrderedSlots[roll];
    }

    private static void IncrementSpeciesCounter(IDictionary<string, int> counterBySpecies, string species, int amount)
    {
        if (!counterBySpecies.TryGetValue(species, out var current))
        {
            counterBySpecies[species] = amount;
            return;
        }

        counterBySpecies[species] = current + amount;
    }

    private static string ResolveItemRarity(OwnedEquipmentInstance item)
    {
        var normalizedStoredRarity = NormalizeRarity(item.Rarity);
        if (normalizedStoredRarity is not null)
        {
            return normalizedStoredRarity;
        }

        if (AccountCatalog.TryGetItem(item.DefinitionId, out var itemDefinition))
        {
            var normalizedDefinitionRarity = NormalizeRarity(itemDefinition.Rarity);
            if (normalizedDefinitionRarity is not null)
            {
                return normalizedDefinitionRarity;
            }
        }

        return CraftedRarityCommon;
    }

    private static string? NormalizeRarity(string? rarity)
    {
        if (string.IsNullOrWhiteSpace(rarity))
        {
            return null;
        }

        return rarity.Trim().ToLowerInvariant();
    }

    private static RefineRule ResolveRefineRuleOrThrow(string currentRarity)
    {
        return currentRarity switch
        {
            "common" => new RefineRule(
                FromRarity: "common",
                ToRarity: "rare",
                PrimalCoreCost: RefineCommonToRarePrimalCoreCost,
                EchoFragmentsCost: RefineCommonToRareEchoFragmentsCost),
            "rare" => new RefineRule(
                FromRarity: "rare",
                ToRarity: "epic",
                PrimalCoreCost: RefineRareToEpicPrimalCoreCost,
                EchoFragmentsCost: RefineRareToEpicEchoFragmentsCost),
            "epic" => new RefineRule(
                FromRarity: "epic",
                ToRarity: "legendary",
                PrimalCoreCost: RefineEpicToLegendaryPrimalCoreCost,
                EchoFragmentsCost: RefineEpicToLegendaryEchoFragmentsCost),
            "legendary" => throw new InvalidOperationException("Item cannot be refined beyond Legendary."),
            _ => throw new InvalidOperationException($"Unsupported item rarity '{currentRarity}' for refinement.")
        };
    }

    private static int ResolveSalvagePrimalCoreOrThrow(string currentRarity)
    {
        return currentRarity switch
        {
            "common" => SalvageCommonPrimalCoreReturn,
            "rare" => SalvageRarePrimalCoreReturn,
            "epic" => SalvageEpicPrimalCoreReturn,
            "legendary" => SalvageLegendaryPrimalCoreReturn,
            _ => throw new InvalidOperationException($"Unsupported item rarity '{currentRarity}' for salvage.")
        };
    }

    private static int ResolveEchoFragmentsAward(string sourceType, string? species)
    {
        _ = species;
        return IsMobSourceType(sourceType) ? EchoFragmentsPerMobKill : 0;
    }

    private static bool IsMobSourceType(string sourceType)
    {
        return string.Equals(NormalizeSourceType(sourceType), "mob", StringComparison.Ordinal);
    }

    private static string NormalizeSpecies(string? species)
    {
        return NormalizeSpeciesOrNull(species) ?? UnknownSpeciesId;
    }

    private static string? NormalizeSpeciesOrNull(string? species)
    {
        if (string.IsNullOrWhiteSpace(species))
        {
            return null;
        }

        return species.Trim().ToLowerInvariant();
    }

    private static string BuildSourceKey(string battleId, int tick, string sourceType, string sourceId)
    {
        return $"{battleId}:{tick}:{NormalizeSourceType(sourceType)}:{sourceId}";
    }

    private static string NormalizeSourceType(string sourceType)
    {
        return string.Equals(sourceType, "chest", StringComparison.OrdinalIgnoreCase)
            ? "chest"
            : "mob";
    }

    private static CharacterState GetCharacterOrThrow(AccountState account, string characterId)
    {
        if (!account.Characters.TryGetValue(characterId, out var character))
        {
            throw new InvalidOperationException($"Character '{characterId}' was not found.");
        }

        return character;
    }

    private static AccountState UpdateCharacter(AccountState account, CharacterState updatedCharacter, int versionIncrement)
    {
        var characters = new Dictionary<string, CharacterState>(account.Characters, StringComparer.Ordinal)
        {
            [updatedCharacter.CharacterId] = updatedCharacter
        };

        return account with
        {
            Characters = characters,
            Version = account.Version + versionIncrement
        };
    }

    private static AccountState UpdateAccountAfterDropAward(AccountState account, CharacterState updatedCharacter, long echoFragmentsBalance)
    {
        return UpdateCharacter(account, updatedCharacter, versionIncrement: 1) with
        {
            EchoFragmentsBalance = echoFragmentsBalance
        };
    }

    private StoredAccount GetOrCreateAccount(string accountId)
    {
        var normalizedAccountId = string.IsNullOrWhiteSpace(accountId) ? "dev_account" : accountId.Trim();
        return _accounts.GetOrAdd(normalizedAccountId, static id => new StoredAccount(CreateSeededAccount(id)));
    }

    private static AccountState CreateSeededAccount(string accountId)
    {
        var kaelisOneId = "kaelis_01";
        var kaelisTwoId = "kaelis_02";
        var kaelisOne = new CharacterState(
            CharacterId: kaelisOneId,
            Name: "Kaelis Dawn",
            Level: 6,
            Xp: 1840,
            Inventory: new CharacterInventory(
                MaterialStacks: new Dictionary<string, long>(StringComparer.Ordinal),
                EquipmentInstances: new Dictionary<string, OwnedEquipmentInstance>(StringComparer.Ordinal)
                {
                    [$"{accountId}.{kaelisOneId}.wpn_01"] = new OwnedEquipmentInstance($"{accountId}.{kaelisOneId}.wpn_01", "wpn.iron_blade", IsLocked: false),
                    [$"{accountId}.{kaelisOneId}.wpn_02"] = new OwnedEquipmentInstance($"{accountId}.{kaelisOneId}.wpn_02", "wpn.hunter_bow", IsLocked: false),
                    [$"{accountId}.{kaelisOneId}.arm_01"] = new OwnedEquipmentInstance($"{accountId}.{kaelisOneId}.arm_01", "arm.guard_plate", IsLocked: false),
                    [$"{accountId}.{kaelisOneId}.arm_02"] = new OwnedEquipmentInstance($"{accountId}.{kaelisOneId}.arm_02", "arm.dragon_mail", IsLocked: false),
                    [$"{accountId}.{kaelisOneId}.rel_01"] = new OwnedEquipmentInstance($"{accountId}.{kaelisOneId}.rel_01", "rel.rune_orb", IsLocked: false),
                    [$"{accountId}.{kaelisOneId}.rel_02"] = new OwnedEquipmentInstance($"{accountId}.{kaelisOneId}.rel_02", "rel.astral_codex", IsLocked: false)
                }),
            Equipment: new EquipmentState(
                WeaponInstanceId: $"{accountId}.{kaelisOneId}.wpn_01",
                ArmorInstanceId: $"{accountId}.{kaelisOneId}.arm_01",
                RelicInstanceId: $"{accountId}.{kaelisOneId}.rel_01"),
            BestiaryKillsBySpecies: new Dictionary<string, int>(StringComparer.Ordinal),
            PrimalCoreBySpecies: new Dictionary<string, int>(StringComparer.Ordinal));

        var kaelisTwo = new CharacterState(
            CharacterId: kaelisTwoId,
            Name: "Kaelis Ember",
            Level: 4,
            Xp: 820,
            Inventory: new CharacterInventory(
                MaterialStacks: new Dictionary<string, long>(StringComparer.Ordinal),
                EquipmentInstances: new Dictionary<string, OwnedEquipmentInstance>(StringComparer.Ordinal)
                {
                    [$"{accountId}.{kaelisTwoId}.wpn_01"] = new OwnedEquipmentInstance($"{accountId}.{kaelisTwoId}.wpn_01", "wpn.ember_staff", IsLocked: false),
                    [$"{accountId}.{kaelisTwoId}.wpn_02"] = new OwnedEquipmentInstance($"{accountId}.{kaelisTwoId}.wpn_02", "wpn.iron_blade", IsLocked: false),
                    [$"{accountId}.{kaelisTwoId}.arm_01"] = new OwnedEquipmentInstance($"{accountId}.{kaelisTwoId}.arm_01", "arm.guard_plate", IsLocked: false),
                    [$"{accountId}.{kaelisTwoId}.rel_01"] = new OwnedEquipmentInstance($"{accountId}.{kaelisTwoId}.rel_01", "rel.rune_orb", IsLocked: false)
                }),
            Equipment: new EquipmentState(
                WeaponInstanceId: $"{accountId}.{kaelisTwoId}.wpn_01",
                ArmorInstanceId: $"{accountId}.{kaelisTwoId}.arm_01",
                RelicInstanceId: $"{accountId}.{kaelisTwoId}.rel_01"),
            BestiaryKillsBySpecies: new Dictionary<string, int>(StringComparer.Ordinal),
            PrimalCoreBySpecies: new Dictionary<string, int>(StringComparer.Ordinal));

        var startsWithRefineReadyResources =
            accountId.Contains("refine_ready", StringComparison.Ordinal) ||
            accountId.Contains("refine_legendary_cap", StringComparison.Ordinal);
        if (startsWithRefineReadyResources)
        {
            var equipmentInstances = new Dictionary<string, OwnedEquipmentInstance>(kaelisOne.Inventory.EquipmentInstances, StringComparer.Ordinal);
            if (accountId.Contains("refine_ready", StringComparison.Ordinal))
            {
                var refineCommonInstanceId = $"{accountId}.{kaelisOneId}.crafted_refine_common";
                equipmentInstances[refineCommonInstanceId] = new OwnedEquipmentInstance(
                    InstanceId: refineCommonInstanceId,
                    DefinitionId: "wpn.primal_forged_blade",
                    IsLocked: false,
                    OriginSpeciesId: "melee_brute",
                    Slot: "weapon",
                    Rarity: "common");
            }

            if (accountId.Contains("refine_legendary_cap", StringComparison.Ordinal))
            {
                var refineLegendaryInstanceId = $"{accountId}.{kaelisOneId}.crafted_refine_legendary";
                equipmentInstances[refineLegendaryInstanceId] = new OwnedEquipmentInstance(
                    InstanceId: refineLegendaryInstanceId,
                    DefinitionId: "wpn.primal_forged_blade",
                    IsLocked: false,
                    OriginSpeciesId: "melee_brute",
                    Slot: "weapon",
                    Rarity: "legendary");
            }

            kaelisOne = kaelisOne with
            {
                Inventory = kaelisOne.Inventory with
                {
                    EquipmentInstances = equipmentInstances
                }
            };
        }

        var startsWithCraftableResources =
            string.Equals(accountId, "dev_account", StringComparison.Ordinal) ||
            accountId.Contains("craft_ready", StringComparison.Ordinal);
        var startsWithAscendantCapProgress = accountId.Contains("ascendant_cap", StringComparison.Ordinal);
        var startsWithAnyCraftingResources =
            startsWithCraftableResources ||
            startsWithRefineReadyResources ||
            startsWithAscendantCapProgress;
        var initialSpeciesProgress = startsWithAscendantCapProgress
            ? 2500
            : startsWithRefineReadyResources
                ? 500
                : 24;
        var initialBestiaryBySpecies = startsWithAnyCraftingResources
            ? new Dictionary<string, int>(StringComparer.Ordinal)
            {
                ["melee_brute"] = initialSpeciesProgress
            }
            : new Dictionary<string, int>(StringComparer.Ordinal);
        var initialPrimalCoreBySpecies = startsWithAnyCraftingResources
            ? new Dictionary<string, int>(StringComparer.Ordinal)
            {
                ["melee_brute"] = startsWithAscendantCapProgress
                    ? 2500
                    : startsWithRefineReadyResources
                        ? 2000
                        : 24
            }
            : new Dictionary<string, int>(StringComparer.Ordinal);
        var initialEchoFragments = startsWithAscendantCapProgress
            ? 5000L
            : startsWithRefineReadyResources
            ? 5000L
            : startsWithCraftableResources
                ? 140L
                : 0L;

        return new AccountState(
            AccountId: accountId,
            ActiveCharacterId: kaelisOneId,
            Version: 1,
            EchoFragmentsBalance: initialEchoFragments,
            Characters: new Dictionary<string, CharacterState>(StringComparer.Ordinal)
            {
                [kaelisOneId] = kaelisOne with
                {
                    BestiaryKillsBySpecies = initialBestiaryBySpecies,
                    PrimalCoreBySpecies = initialPrimalCoreBySpecies
                },
                [kaelisTwoId] = kaelisTwo
            });
    }

    private static AccountState CloneAccountState(AccountState state)
    {
        var characters = new SortedDictionary<string, CharacterState>(StringComparer.Ordinal);
        foreach (var (characterId, character) in state.Characters.OrderBy(entry => entry.Key, StringComparer.Ordinal))
        {
            characters[characterId] = CloneCharacterState(character);
        }

        return state with
        {
            Characters = characters
        };
    }

    private static CharacterState CloneCharacterState(CharacterState character)
    {
        var materialStacks = new SortedDictionary<string, long>(StringComparer.Ordinal);
        foreach (var (itemId, quantity) in character.Inventory.MaterialStacks.OrderBy(entry => entry.Key, StringComparer.Ordinal))
        {
            materialStacks[itemId] = quantity;
        }

        var equipmentInstances = new SortedDictionary<string, OwnedEquipmentInstance>(StringComparer.Ordinal);
        foreach (var (instanceId, equipment) in character.Inventory.EquipmentInstances.OrderBy(entry => entry.Key, StringComparer.Ordinal))
        {
            equipmentInstances[instanceId] = equipment;
        }

        var bestiaryKillsBySpecies = new SortedDictionary<string, int>(StringComparer.Ordinal);
        foreach (var (species, kills) in character.BestiaryKillsBySpecies.OrderBy(entry => entry.Key, StringComparer.Ordinal))
        {
            bestiaryKillsBySpecies[species] = kills;
        }

        var primalCoreBySpecies = new SortedDictionary<string, int>(StringComparer.Ordinal);
        foreach (var (species, balance) in character.PrimalCoreBySpecies.OrderBy(entry => entry.Key, StringComparer.Ordinal))
        {
            primalCoreBySpecies[species] = balance;
        }

        return character with
        {
            Inventory = new CharacterInventory(
                MaterialStacks: materialStacks,
                EquipmentInstances: equipmentInstances),
            BestiaryKillsBySpecies = bestiaryKillsBySpecies,
            PrimalCoreBySpecies = primalCoreBySpecies
        };
    }

    private sealed class StoredAccount
    {
        public StoredAccount(AccountState state)
        {
            State = state;
        }

        public object Sync { get; } = new();

        public AccountState State { get; set; }

        public Dictionary<string, Dictionary<string, IReadOnlyList<DropEvent>>> AwardedBySourceKeyByCharacter { get; } =
            new(StringComparer.Ordinal);
    }

    private readonly record struct RefineRule(
        string FromRarity,
        string ToRarity,
        int PrimalCoreCost,
        int EchoFragmentsCost);
}
