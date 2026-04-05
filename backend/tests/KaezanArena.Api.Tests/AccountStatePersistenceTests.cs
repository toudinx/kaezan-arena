using KaezanArena.Api.Account;
using KaezanArena.Api.Battle;

namespace KaezanArena.Api.Tests;

public sealed class AccountStatePersistenceTests
{
    [Fact]
    public void SaveLoadRoundtrip_PreservesAccountMutations()
    {
        var storagePath = BuildTempStoragePath();
        try
        {
            const string accountId = "account_persistence_roundtrip";
            var persistence = new JsonFileAccountStatePersistence(storagePath);
            var store = new InMemoryAccountStateStore(persistence);

            var initial = store.GetAccountState(accountId);
            var nextCharacterId = initial.Characters.Keys.First(characterId =>
                !string.Equals(characterId, initial.ActiveCharacterId, StringComparison.Ordinal));
            var updated = store.SetActiveCharacter(accountId, nextCharacterId);

            var reloadedStore = new InMemoryAccountStateStore(persistence);
            var reloaded = reloadedStore.GetAccountState(accountId);

            Assert.Equal(updated.AccountId, reloaded.AccountId);
            Assert.Equal(updated.ActiveCharacterId, reloaded.ActiveCharacterId);
            Assert.Equal(updated.Version, reloaded.Version);
            Assert.Equal(updated.EchoFragmentsBalance, reloaded.EchoFragmentsBalance);
            Assert.Equal(updated.Characters.Keys.OrderBy(value => value), reloaded.Characters.Keys.OrderBy(value => value));
        }
        finally
        {
            DeleteDirectoryIfExists(storagePath);
        }
    }

    [Fact]
    public void StartupWithMissingFiles_UsesSeededInMemoryStateSafely()
    {
        var storagePath = BuildTempStoragePath();
        DeleteDirectoryIfExists(storagePath);
        Assert.False(Directory.Exists(storagePath));

        var persistence = new JsonFileAccountStatePersistence(storagePath);
        var store = new InMemoryAccountStateStore(persistence);

        var state = store.GetAccountState("account_persistence_missing_files");
        Assert.Equal("account_persistence_missing_files", state.AccountId);
        Assert.NotEmpty(state.Characters);
    }

    [Fact]
    public void ExistingAwardDropProgression_IdempotencyStillWorksAfterReload()
    {
        var storagePath = BuildTempStoragePath();
        try
        {
            const string accountId = "account_persistence_progression";
            const string runId = "run-persistence-progression";
            const string battleId = "battle-persistence-progression";
            var source = new DropSource(
                Tick: 1,
                SourceType: "mob",
                SourceId: "mob-source-001",
                Species: "melee_brute");
            var persistence = new JsonFileAccountStatePersistence(storagePath);
            var firstStore = new InMemoryAccountStateStore(persistence);

            var initial = firstStore.GetAccountState(accountId);
            var characterId = initial.ActiveCharacterId;
            var initialKills = initial.Characters[characterId].BestiaryKillsBySpecies.GetValueOrDefault("melee_brute", 0);

            var firstAward = firstStore.AwardDrops(
                accountId: accountId,
                characterId: characterId,
                battleId: battleId,
                sources: [source],
                runId: runId,
                battleSeed: 2026);
            var afterFirst = firstStore.GetAccountState(accountId);
            var killsAfterFirst = afterFirst.Characters[characterId].BestiaryKillsBySpecies.GetValueOrDefault("melee_brute", 0);
            Assert.Equal(initialKills + 1, killsAfterFirst);

            var secondStore = new InMemoryAccountStateStore(persistence);
            var secondAward = secondStore.AwardDrops(
                accountId: accountId,
                characterId: characterId,
                battleId: battleId,
                sources: [source],
                runId: runId,
                battleSeed: 2026);
            var afterSecond = secondStore.GetAccountState(accountId);
            var killsAfterSecond = afterSecond.Characters[characterId].BestiaryKillsBySpecies.GetValueOrDefault("melee_brute", 0);

            Assert.Equal(killsAfterFirst, killsAfterSecond);
            Assert.Equal(
                firstAward.Awarded.Select(drop => drop.DropEventId).ToList(),
                secondAward.Awarded.Select(drop => drop.DropEventId).ToList());
        }
        finally
        {
            DeleteDirectoryIfExists(storagePath);
        }
    }

    [Fact]
    public void EquipItem_CanReassignWeaponAcrossCharactersWithinSameAccount()
    {
        var storagePath = BuildTempStoragePath();
        try
        {
            const string accountId = "account_cross_character_equip";
            var persistence = new JsonFileAccountStatePersistence(storagePath);
            var store = new InMemoryAccountStateStore(persistence);

            var initial = store.GetAccountState(accountId);
            var sourceCharacter = initial.Characters.Values.First(character =>
                character.Inventory.EquipmentInstances.Values.Any(instance =>
                    AccountCatalog.TryGetEquipment(instance.DefinitionId, out var definition)
                    && string.Equals(definition.Slot, "weapon", StringComparison.OrdinalIgnoreCase)));
            var targetCharacterId = initial.Characters.Keys.First(characterId =>
                !string.Equals(characterId, sourceCharacter.CharacterId, StringComparison.Ordinal));

            var sourceWeaponInstanceId = sourceCharacter.Inventory.EquipmentInstances.Values.First(instance =>
                AccountCatalog.TryGetEquipment(instance.DefinitionId, out var definition)
                && string.Equals(definition.Slot, "weapon", StringComparison.OrdinalIgnoreCase)).InstanceId;
            var sourceEquippedWeaponBefore = sourceCharacter.Equipment.WeaponInstanceId;

            var updatedTarget = store.EquipItem(
                accountId: accountId,
                characterId: targetCharacterId,
                slot: EquipmentSlot.Weapon,
                equipmentInstanceId: sourceWeaponInstanceId);
            var after = store.GetAccountState(accountId);

            Assert.Equal(sourceWeaponInstanceId, updatedTarget.Equipment.WeaponInstanceId);
            Assert.True(after.Characters[targetCharacterId].Inventory.EquipmentInstances.ContainsKey(sourceWeaponInstanceId));
            Assert.False(after.Characters[sourceCharacter.CharacterId].Inventory.EquipmentInstances.ContainsKey(sourceWeaponInstanceId));

            if (string.Equals(sourceEquippedWeaponBefore, sourceWeaponInstanceId, StringComparison.Ordinal))
            {
                Assert.NotEqual(
                    sourceWeaponInstanceId,
                    after.Characters[sourceCharacter.CharacterId].Equipment.WeaponInstanceId);
            }
        }
        finally
        {
            DeleteDirectoryIfExists(storagePath);
        }
    }

    [Fact]
    public void LoadLegacySigilInventory_MissingDefinitionId_IsNormalizedOnRead()
    {
        const string accountId = "account_legacy_sigil_definition";
        var seededState = new InMemoryAccountStateStore().GetAccountState(accountId);
        var sigilEntry = seededState.SigilInventory.Single();
        var legacySigil = sigilEntry.Value with { DefinitionId = string.Empty };

        var legacyState = seededState with
        {
            SigilInventory = new Dictionary<string, SigilInstance>(StringComparer.Ordinal)
            {
                [sigilEntry.Key] = legacySigil
            }
        };

        var persistence = new StubAccountStatePersistence(
            new Dictionary<string, PersistedAccountData>(StringComparer.Ordinal)
            {
                [accountId] = new PersistedAccountData(
                    State: legacyState,
                    AwardedBySourceKeyByCharacter: new Dictionary<string, Dictionary<string, List<DropEvent>>>(StringComparer.Ordinal))
            });

        var store = new InMemoryAccountStateStore(persistence);
        var normalized = store.GetAccountState(accountId);
        var normalizedSigil = normalized.SigilInventory[sigilEntry.Key];

        Assert.Equal(
            ArenaConfig.SigilConfig.ResolveDefinitionIdForSpeciesId(normalizedSigil.SpeciesId),
            normalizedSigil.DefinitionId);
        Assert.False(normalizedSigil.IsLocked);
    }

    [Fact]
    public void EquipSigil_FailsWhenSigilIsLocked()
    {
        const string accountId = "account_locked_sigil";
        var seededState = new InMemoryAccountStateStore().GetAccountState(accountId);
        var sigilEntry = seededState.SigilInventory.Single();
        var lockedSigil = sigilEntry.Value with
        {
            IsLocked = true,
            DefinitionId = ArenaConfig.SigilConfig.ResolveDefinitionIdForSpeciesId(sigilEntry.Value.SpeciesId)
        };

        var stateWithLockedSigil = seededState with
        {
            SigilInventory = new Dictionary<string, SigilInstance>(StringComparer.Ordinal)
            {
                [sigilEntry.Key] = lockedSigil
            }
        };

        var persistence = new StubAccountStatePersistence(
            new Dictionary<string, PersistedAccountData>(StringComparer.Ordinal)
            {
                [accountId] = new PersistedAccountData(
                    State: stateWithLockedSigil,
                    AwardedBySourceKeyByCharacter: new Dictionary<string, Dictionary<string, List<DropEvent>>>(StringComparer.Ordinal))
            });

        var store = new InMemoryAccountStateStore(persistence);
        var ex = Assert.Throws<InvalidOperationException>(() =>
            store.EquipSigil(accountId, seededState.ActiveCharacterId, sigilEntry.Key));

        Assert.Contains("locked", ex.Message, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public void EquipSigil_FailsWhenRequestedSlotDoesNotMatchSigilTier()
    {
        const string accountId = "account_sigil_slot_mismatch";
        var store = new InMemoryAccountStateStore();
        var state = store.GetAccountState(accountId);
        var sigil = state.SigilInventory.Single().Value;
        var characterId = state.ActiveCharacterId;
        var wrongSlotIndex = sigil.SlotIndex == 1 ? 2 : 1;

        var ex = Assert.Throws<InvalidOperationException>(() =>
            store.EquipSigil(accountId, characterId, wrongSlotIndex, sigil.InstanceId));

        Assert.Contains("tier-compatible", ex.Message, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public void EquipSigil_FailsWhenAscendantUnlockIsRequiredButMissing()
    {
        const string accountId = "account_sigil_requires_ascendant";
        var seededState = new InMemoryAccountStateStore().GetAccountState(accountId);
        var sigilEntry = seededState.SigilInventory.Single();
        var sigilRequiringAscendant = sigilEntry.Value with
        {
            RequiresAscendantUnlock = true
        };

        var stateWithAscendantSigil = seededState with
        {
            SigilInventory = new Dictionary<string, SigilInstance>(StringComparer.Ordinal)
            {
                [sigilEntry.Key] = sigilRequiringAscendant
            }
        };

        var persistence = new StubAccountStatePersistence(
            new Dictionary<string, PersistedAccountData>(StringComparer.Ordinal)
            {
                [accountId] = new PersistedAccountData(
                    State: stateWithAscendantSigil,
                    AwardedBySourceKeyByCharacter: new Dictionary<string, Dictionary<string, List<DropEvent>>>(StringComparer.Ordinal))
            });

        var store = new InMemoryAccountStateStore(persistence);
        var ex = Assert.Throws<InvalidOperationException>(() =>
            store.EquipSigil(accountId, seededState.ActiveCharacterId, sigilEntry.Value.SlotIndex, sigilEntry.Key));

        Assert.Contains("Ascendant unlock", ex.Message, StringComparison.OrdinalIgnoreCase);
    }

    private static string BuildTempStoragePath()
    {
        return Path.Combine(Path.GetTempPath(), "kaezan-arena-tests", Guid.NewGuid().ToString("N"), "accounts");
    }

    private static void DeleteDirectoryIfExists(string path)
    {
        if (!Directory.Exists(path))
        {
            return;
        }

        try
        {
            Directory.Delete(path, recursive: true);
        }
        catch
        {
            // Best effort cleanup for temporary test storage.
        }
    }

    private sealed class StubAccountStatePersistence : IAccountStatePersistence
    {
        private readonly IReadOnlyDictionary<string, PersistedAccountData> _data;

        public StubAccountStatePersistence(IReadOnlyDictionary<string, PersistedAccountData> data)
        {
            _data = data;
        }

        public IReadOnlyDictionary<string, PersistedAccountData> LoadAll()
        {
            return _data;
        }

        public void Save(PersistedAccountData persistedAccount)
        {
            // no-op for unit tests
        }
    }
}
