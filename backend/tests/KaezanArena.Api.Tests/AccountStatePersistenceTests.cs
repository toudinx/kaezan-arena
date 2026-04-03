using KaezanArena.Api.Account;

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
}
