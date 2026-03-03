using System.Collections.Concurrent;

namespace KaezanArena.Api.Account;

public sealed class InMemoryAccountStateStore : IAccountStateStore
{
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

    public AwardDropsResult AwardDrops(string accountId, string characterId, string battleId, IReadOnlyList<DropSource> sources)
    {
        var account = GetOrCreateAccount(accountId);
        lock (account.Sync)
        {
            var character = GetCharacterOrThrow(account.State, characterId);
            var materialStacks = new Dictionary<string, long>(character.Inventory.MaterialStacks, StringComparer.Ordinal);
            var equipmentInstances = new Dictionary<string, OwnedEquipmentInstance>(character.Inventory.EquipmentInstances, StringComparer.Ordinal);
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

                var rolledEvents = RollDrops(
                    accountId: account.State.AccountId,
                    characterId: characterId,
                    battleId: battleId,
                    source: source,
                    sourceKey: sourceKey,
                    materialStacks: materialStacks,
                    equipmentInstances: equipmentInstances);

                alreadyAwardedBySourceKey[sourceKey] = rolledEvents;
                awarded.AddRange(rolledEvents);
                changed = true;
            }

            if (changed)
            {
                var updatedCharacter = character with
                {
                    Inventory = new CharacterInventory(
                        MaterialStacks: new Dictionary<string, long>(materialStacks, StringComparer.Ordinal),
                        EquipmentInstances: new Dictionary<string, OwnedEquipmentInstance>(equipmentInstances, StringComparer.Ordinal))
                };

                account.State = UpdateCharacter(account.State, updatedCharacter, versionIncrement: 1);
                character = updatedCharacter;
            }

            return new AwardDropsResult(
                Awarded: awarded,
                Character: CloneCharacterState(character));
        }
    }

    private static List<DropEvent> RollDrops(
        string accountId,
        string characterId,
        string battleId,
        DropSource source,
        string sourceKey,
        IDictionary<string, long> materialStacks,
        IDictionary<string, OwnedEquipmentInstance> equipmentInstances)
    {
        var normalizedSourceType = NormalizeSourceType(source.SourceType);
        var nowUtc = DateTimeOffset.UtcNow;
        var seed = DeterministicSeed.FromParts(accountId, characterId, battleId, source.Tick.ToString(), normalizedSourceType, source.SourceId);
        var rng = new Random(seed);

        var events = new List<DropEvent>(capacity: 2);

        var materialItemId = AccountCatalog.ResolveGuaranteedMaterial(normalizedSourceType, source.Species);
        IncrementMaterial(materialStacks, materialItemId, amount: 1);
        events.Add(new DropEvent(
            DropEventId: DeterministicSeed.HashId("dropevt", accountId, characterId, sourceKey, materialItemId, "0"),
            AccountId: accountId,
            CharacterId: characterId,
            BattleId: battleId,
            Tick: source.Tick,
            SourceType: normalizedSourceType,
            SourceId: source.SourceId,
            ItemId: materialItemId,
            Quantity: 1,
            EquipmentInstanceId: null,
            AwardedAtUtc: nowUtc));

        var chancePercent = AccountCatalog.ResolveEquipmentDropChancePercent(normalizedSourceType);
        if (rng.Next(100) < chancePercent)
        {
            var dropTable = AccountCatalog.ResolveEquipmentDropTable(normalizedSourceType);
            var entry = RollWeightedEntry(dropTable.Entries, rng);
            var quantity = Math.Clamp(entry.MinQuantity, 1, entry.MaxQuantity);
            var equipmentInstanceId = DeterministicSeed.HashId("eqinst", accountId, characterId, sourceKey, entry.ItemId, "0");
            equipmentInstances[equipmentInstanceId] = new OwnedEquipmentInstance(
                InstanceId: equipmentInstanceId,
                DefinitionId: entry.ItemId,
                IsLocked: false);

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
                AwardedAtUtc: nowUtc));
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

    private static void IncrementMaterial(IDictionary<string, long> materialStacks, string itemId, int amount)
    {
        if (!materialStacks.TryGetValue(itemId, out var current))
        {
            materialStacks[itemId] = amount;
            return;
        }

        materialStacks[itemId] = current + amount;
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
                MaterialStacks: new Dictionary<string, long>(StringComparer.Ordinal)
                {
                    ["mat.scrap_iron"] = 12,
                    ["mat.hardwood"] = 5,
                    ["mat.arcane_dust"] = 2
                },
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
                RelicInstanceId: $"{accountId}.{kaelisOneId}.rel_01"));

        var kaelisTwo = new CharacterState(
            CharacterId: kaelisTwoId,
            Name: "Kaelis Ember",
            Level: 4,
            Xp: 820,
            Inventory: new CharacterInventory(
                MaterialStacks: new Dictionary<string, long>(StringComparer.Ordinal)
                {
                    ["mat.ember_core"] = 9,
                    ["mat.scrap_iron"] = 3,
                    ["mat.arcane_dust"] = 1
                },
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
                RelicInstanceId: $"{accountId}.{kaelisTwoId}.rel_01"));

        return new AccountState(
            AccountId: accountId,
            ActiveCharacterId: kaelisOneId,
            Version: 1,
            Characters: new Dictionary<string, CharacterState>(StringComparer.Ordinal)
            {
                [kaelisOneId] = kaelisOne,
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

        return character with
        {
            Inventory = new CharacterInventory(
                MaterialStacks: materialStacks,
                EquipmentInstances: equipmentInstances)
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
}
