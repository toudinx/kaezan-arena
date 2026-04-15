using System.Collections.Concurrent;
using KaezanArena.Api.Battle;
using KaezanArena.Api.Contracts.Battle;

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
    private const int AscendantBaseDropChancePpm = 200;
    private const int AscendantBonusPer100KillsPpm = 100;
    private const int AscendantDropChanceCapPpm = 2000;
    private const int PpmScale = 1_000_000;
    private const string CraftedRarityCommon = "common";
    private const string CraftedRarityAscendant = "ascendant";
    private const string RewardKindItem = "item";
    private const string RewardKindEchoFragments = "echo_fragments";
    private const string RewardKindPrimalCore = "primal_core";
    private const string RewardKindSigil = "sigil";
    private const string RewardKindMaterial = "material";
    private const string EchoFragmentsItemId = "currency.echo_fragments";
    private const string UnknownSpeciesId = "unknown_species";
    private const string SeedSigilInstanceId = "sigil_test_001";
    private const string SeedSigilSpeciesId = ArenaConfig.SpeciesIds.MeleeBrute;
    private const int SeedSigilLevel = 7;
    private readonly ConcurrentDictionary<string, StoredAccount> _accounts = new(StringComparer.Ordinal);
    private readonly IAccountStatePersistence _persistence;

    public InMemoryAccountStateStore(IAccountStatePersistence? persistence = null)
    {
        _persistence = persistence ?? NullAccountStatePersistence.Instance;
        foreach (var (accountId, persistedAccount) in _persistence.LoadAll())
        {
            if (persistedAccount?.State is null)
            {
                continue;
            }

            var normalizedAccountId = string.IsNullOrWhiteSpace(accountId) ? persistedAccount.State.AccountId : accountId;
            if (string.IsNullOrWhiteSpace(normalizedAccountId))
            {
                continue;
            }

            var needsMigration = NeedsMigration(persistedAccount.State);
            var normalizedState = NormalizeLoadedAccountState(persistedAccount.State);
            var storedAccount = new StoredAccount(
                state: CloneAccountState(normalizedState),
                awardedBySourceKeyByCharacter: CloneAwardedBySourceKeyByCharacter(
                    persistedAccount.AwardedBySourceKeyByCharacter));
            _accounts[normalizedAccountId] = storedAccount;
            if (needsMigration)
            {
                PersistAccount(storedAccount);
            }
        }
    }

    public AccountState GetAccountState(string accountId)
    {
        var account = GetOrCreateAccount(accountId);
        lock (account.Sync)
        {
            EnsureDailyContractsRefreshed(account);
            return CloneAccountState(account.State);
        }
    }

    public AccountState SetActiveCharacter(string accountId, string characterId)
    {
        var account = GetOrCreateAccount(accountId);
        lock (account.Sync)
        {
            EnsureDailyContractsRefreshed(account);
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
                PersistAccount(account);
            }

            return CloneAccountState(account.State);
        }
    }

    public CharacterState EquipItem(string accountId, string characterId, EquipmentSlot slot, string equipmentInstanceId)
    {
        var account = GetOrCreateAccount(accountId);
        lock (account.Sync)
        {
            EnsureDailyContractsRefreshed(account);
            var targetCharacter = GetCharacterOrThrow(account.State, characterId);
            var sourceCharacterId = characterId;
            var sourceCharacter = targetCharacter;
            OwnedEquipmentInstance? equipmentInstance = null;

            foreach (var (candidateCharacterId, candidateCharacter) in account.State.Characters)
            {
                if (!candidateCharacter.Inventory.EquipmentInstances.TryGetValue(equipmentInstanceId, out var foundInstance))
                {
                    continue;
                }

                sourceCharacterId = candidateCharacterId;
                sourceCharacter = candidateCharacter;
                equipmentInstance = foundInstance;
                break;
            }

            if (equipmentInstance is null)
            {
                throw new InvalidOperationException(
                    $"Equipment instance '{equipmentInstanceId}' was not found in account '{accountId}'.");
            }

            if (equipmentInstance.IsLocked)
            {
                throw new InvalidOperationException($"Equipment instance '{equipmentInstanceId}' is locked and cannot be equipped.");
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

            if (IsBestiaryForgedWeapon(equipmentInstance))
            {
                var craftedByCharacterId = equipmentInstance.CraftedByCharacterId?.Trim();
                if (!string.IsNullOrWhiteSpace(craftedByCharacterId) &&
                    !string.Equals(craftedByCharacterId, characterId, StringComparison.Ordinal))
                {
                    throw new InvalidOperationException(
                        $"Bestiary-forged weapons are bound to their creator. Item '{equipmentInstanceId}' can only be equipped by '{craftedByCharacterId}'.");
                }

                if (string.IsNullOrWhiteSpace(craftedByCharacterId) &&
                    !string.Equals(sourceCharacterId, characterId, StringComparison.Ordinal))
                {
                    throw new InvalidOperationException(
                        $"Bestiary-forged weapons are bound to their creator and cannot be moved between characters.");
                }
            }

            var updatedCharacters = new Dictionary<string, CharacterState>(account.State.Characters, StringComparer.Ordinal);
            if (!string.Equals(sourceCharacterId, characterId, StringComparison.Ordinal))
            {
                var updatedSourceEquipmentInstances =
                    new Dictionary<string, OwnedEquipmentInstance>(sourceCharacter.Inventory.EquipmentInstances, StringComparer.Ordinal);
                updatedSourceEquipmentInstances.Remove(equipmentInstanceId);

                var updatedSourceEquipment = sourceCharacter.Equipment;
                if (string.Equals(updatedSourceEquipment.GetInstanceId(slot), equipmentInstanceId, StringComparison.Ordinal))
                {
                    updatedSourceEquipment = updatedSourceEquipment.SetInstanceId(slot, null);
                }

                var updatedSourceCharacter = sourceCharacter with
                {
                    Inventory = sourceCharacter.Inventory with
                    {
                        EquipmentInstances = updatedSourceEquipmentInstances
                    },
                    Equipment = updatedSourceEquipment
                };
                updatedCharacters[sourceCharacterId] = updatedSourceCharacter;

                var updatedTargetEquipmentInstances =
                    new Dictionary<string, OwnedEquipmentInstance>(targetCharacter.Inventory.EquipmentInstances, StringComparer.Ordinal)
                    {
                        [equipmentInstanceId] = equipmentInstance
                    };
                targetCharacter = targetCharacter with
                {
                    Inventory = targetCharacter.Inventory with
                    {
                        EquipmentInstances = updatedTargetEquipmentInstances
                    }
                };
            }

            var updatedCharacter = targetCharacter with
            {
                Equipment = targetCharacter.Equipment.SetInstanceId(slot, equipmentInstanceId)
            };
            updatedCharacters[characterId] = updatedCharacter;

            account.State = account.State with
            {
                Characters = updatedCharacters,
                Version = account.State.Version + 1
            };
            PersistAccount(account);
            return CloneCharacterState(updatedCharacter);
        }
    }

    public CharacterState EquipWeapon(string accountId, string characterId, string weaponInstanceId)
    {
        return EquipItem(accountId, characterId, EquipmentSlot.Weapon, weaponInstanceId);
    }

    public AccountState EquipSigil(string accountId, string characterId, int slotIndex, string sigilInstanceId)
    {
        var account = GetOrCreateAccount(accountId);
        lock (account.Sync)
        {
            EnsureDailyContractsRefreshed(account);
            return EquipSigilInternal(account, characterId, slotIndex, sigilInstanceId);
        }
    }

    public AccountState EquipSigil(string accountId, string characterId, string sigilInstanceId)
    {
        var account = GetOrCreateAccount(accountId);
        lock (account.Sync)
        {
            EnsureDailyContractsRefreshed(account);
            if (string.IsNullOrWhiteSpace(sigilInstanceId))
            {
                throw new InvalidOperationException("sigilInstanceId is required.");
            }

            var normalizedSigilInstanceId = sigilInstanceId.Trim();
            if (!account.State.SigilInventory.TryGetValue(normalizedSigilInstanceId, out var sigil))
            {
                throw new InvalidOperationException(
                    $"Sigil '{normalizedSigilInstanceId}' was not found in account inventory.");
            }

            return EquipSigilInternal(account, characterId, sigil.SlotIndex, normalizedSigilInstanceId);
        }
    }

    private AccountState EquipSigilInternal(StoredAccount account, string characterId, int slotIndex, string sigilInstanceId)
    {
        if (string.IsNullOrWhiteSpace(sigilInstanceId))
        {
            throw new InvalidOperationException("sigilInstanceId is required.");
        }

        var normalizedSigilInstanceId = sigilInstanceId.Trim();
        ValidateSigilSlotIndex(slotIndex);
        if (!account.State.SigilInventory.TryGetValue(normalizedSigilInstanceId, out var sigil))
        {
            throw new InvalidOperationException(
                $"Sigil '{normalizedSigilInstanceId}' was not found in account inventory.");
        }

        if (sigil.IsLocked)
        {
            throw new InvalidOperationException($"Sigil '{normalizedSigilInstanceId}' is locked and cannot be equipped.");
        }

        if (!ArenaConfig.SigilConfig.IsValidSpeciesId(sigil.SpeciesId))
        {
            throw new InvalidOperationException(
                $"Sigil '{normalizedSigilInstanceId}' has invalid species '{sigil.SpeciesId}'.");
        }

        var expectedDefinitionId = ArenaConfig.SigilConfig.ResolveDefinitionIdForSpeciesId(sigil.SpeciesId);
        if (!string.Equals(sigil.DefinitionId, expectedDefinitionId, StringComparison.Ordinal))
        {
            throw new InvalidOperationException(
                $"Sigil '{normalizedSigilInstanceId}' has invalid definition '{sigil.DefinitionId}' for species '{sigil.SpeciesId}'.");
        }

        var expectedSlotIndex = SigilSlotResolver.ResolveSlotIndexForLevel(sigil.SigilLevel);
        if (expectedSlotIndex != sigil.SlotIndex)
        {
            throw new InvalidOperationException(
                $"Sigil '{normalizedSigilInstanceId}' has inconsistent slot mapping for level {sigil.SigilLevel}.");
        }

        if (slotIndex != sigil.SlotIndex)
        {
            throw new InvalidOperationException(
                $"Sigil '{normalizedSigilInstanceId}' is tier-compatible only with slot {sigil.SlotIndex}.");
        }

        var character = GetCharacterOrThrow(account.State, characterId);
        if (slotIndex > character.UnlockedSigilSlots)
        {
            throw new InvalidOperationException(
                $"Sigil slot {slotIndex} is locked for character '{characterId}'.");
        }

        var loadout = character.SigilLoadout;
        for (var requiredSlotIndex = 1; requiredSlotIndex < slotIndex; requiredSlotIndex += 1)
        {
            if (string.IsNullOrWhiteSpace(loadout.GetSlotInstanceId(requiredSlotIndex)))
            {
                throw new InvalidOperationException(
                    $"Cannot equip slot {slotIndex} without slot {requiredSlotIndex} filled.");
            }
        }

        if (sigil.RequiresAscendantUnlock && !IsAscendantTierUnlocked(character, slotIndex))
        {
            throw new InvalidOperationException(
                $"Sigil '{normalizedSigilInstanceId}' requires Ascendant unlock for slot {slotIndex}.");
        }

        if (TryFindSigilEquippedLocation(account.State, normalizedSigilInstanceId, out var equippedCharacterId, out var equippedSlotIndex) &&
            (!string.Equals(equippedCharacterId, character.CharacterId, StringComparison.Ordinal) || equippedSlotIndex != slotIndex))
        {
            throw new InvalidOperationException(
                $"Sigil '{normalizedSigilInstanceId}' is already equipped by character '{equippedCharacterId}' in slot {equippedSlotIndex}.");
        }

        var updatedCharacter = character with
        {
            SigilLoadout = loadout.SetSlotInstanceId(slotIndex, normalizedSigilInstanceId)
        };

        if (updatedCharacter == character)
        {
            return CloneAccountState(account.State);
        }

        account.State = UpdateCharacter(account.State, updatedCharacter, versionIncrement: 1);
        PersistAccount(account);
        return CloneAccountState(account.State);
    }

    public AccountState UnequipSigil(string accountId, string characterId, int slotIndex)
    {
        var account = GetOrCreateAccount(accountId);
        lock (account.Sync)
        {
            EnsureDailyContractsRefreshed(account);
            ValidateSigilSlotIndex(slotIndex);
            var character = GetCharacterOrThrow(account.State, characterId);
            var loadout = character.SigilLoadout;

            for (var higherSlotIndex = slotIndex + 1; higherSlotIndex <= ArenaConfig.SigilConfig.SlotLevelRanges.Length; higherSlotIndex += 1)
            {
                if (!string.IsNullOrWhiteSpace(loadout.GetSlotInstanceId(higherSlotIndex)))
                {
                    throw new InvalidOperationException(
                        $"Cannot unequip slot {slotIndex} while slot {higherSlotIndex} is filled.");
                }
            }

            if (string.IsNullOrWhiteSpace(loadout.GetSlotInstanceId(slotIndex)))
            {
                return CloneAccountState(account.State);
            }

            var updatedCharacter = character with
            {
                SigilLoadout = loadout.SetSlotInstanceId(slotIndex, null)
            };

            account.State = UpdateCharacter(account.State, updatedCharacter, versionIncrement: 1);
            PersistAccount(account);
            return CloneAccountState(account.State);
        }
    }

    private static bool IsAscendantTierUnlocked(CharacterState character, int slotIndex)
    {
        var tierIndex = slotIndex - 1;
        return character.AscendantSigilSlotsUnlocked.TryGetValue(tierIndex, out var isUnlocked) && isUnlocked;
    }

    private static bool TryFindSigilEquippedLocation(
        AccountState account,
        string sigilInstanceId,
        out string characterId,
        out int slotIndex)
    {
        foreach (var (candidateCharacterId, candidateCharacter) in account.Characters)
        {
            for (var candidateSlotIndex = 1; candidateSlotIndex <= ArenaConfig.SigilConfig.SlotLevelRanges.Length; candidateSlotIndex += 1)
            {
                if (!string.Equals(candidateCharacter.SigilLoadout.GetSlotInstanceId(candidateSlotIndex), sigilInstanceId, StringComparison.Ordinal))
                {
                    continue;
                }

                characterId = candidateCharacterId;
                slotIndex = candidateSlotIndex;
                return true;
            }
        }

        characterId = string.Empty;
        slotIndex = 0;
        return false;
    }

    public AccountState AwardMasteryXp(string accountId, string characterId, int xpAmount)
    {
        var account = GetOrCreateAccount(accountId);
        lock (account.Sync)
        {
            EnsureDailyContractsRefreshed(account);
            var character = GetCharacterOrThrow(account.State, characterId);
            var safeXpAmount = Math.Max(0, xpAmount);
            if (safeXpAmount <= 0)
            {
                return CloneAccountState(account.State);
            }

            var currentMasteryXp = Math.Max(0L, character.MasteryXp);
            long nextMasteryXp;
            try
            {
                nextMasteryXp = checked(currentMasteryXp + safeXpAmount);
            }
            catch (OverflowException)
            {
                nextMasteryXp = long.MaxValue;
            }

            var masteryXpAtCap = ResolveTotalXpRequiredToReachLevel(ArenaConfig.MasteryConfig.MasteryLevelCap);
            var cappedMasteryXp = Math.Min(nextMasteryXp, masteryXpAtCap);
            var previousLevel = Math.Clamp(
                character.MasteryLevel,
                1,
                ArenaConfig.MasteryConfig.MasteryLevelCap);
            var nextLevel = ResolveMasteryLevelFromTotalXp(cappedMasteryXp, character.HollowEssenceBarrierCleared);
            var nextUnlockedSigilSlots = ResolveSigilSlotsForMasteryLevel(nextLevel);
            var rewardDelta = ResolveMilestoneRewardDelta(
                previousLevel: previousLevel,
                nextLevel: nextLevel);

            var updatedCharacter = character with
            {
                MasteryXp = cappedMasteryXp,
                MasteryLevel = nextLevel,
                UnlockedSigilSlots = nextUnlockedSigilSlots
            };

            var updatedEchoFragmentsBalance = account.State.EchoFragmentsBalance + rewardDelta.EchoFragmentsAward;
            var updatedKaerosBalance = account.State.KaerosBalance + rewardDelta.KaerosAward;
            var hasChanges =
                updatedCharacter != character ||
                updatedEchoFragmentsBalance != account.State.EchoFragmentsBalance ||
                updatedKaerosBalance != account.State.KaerosBalance;
            if (!hasChanges)
            {
                return CloneAccountState(account.State);
            }

            account.State = UpdateCharacter(account.State, updatedCharacter, versionIncrement: 1) with
            {
                EchoFragmentsBalance = updatedEchoFragmentsBalance,
                KaerosBalance = updatedKaerosBalance
            };
            PersistAccount(account);
            return CloneAccountState(account.State);
        }
    }

    public AccountState AwardAccountXp(string accountId, int xpAmount)
    {
        var account = GetOrCreateAccount(accountId);
        lock (account.Sync)
        {
            EnsureDailyContractsRefreshed(account);
            var updatedState = ApplyAccountXpAward(account.State, xpAmount);
            if (updatedState == account.State)
            {
                return CloneAccountState(account.State);
            }

            account.State = updatedState with { Version = account.State.Version + 1 };
            PersistAccount(account);
            return CloneAccountState(account.State);
        }
    }

    public AccountState EvaluateContractsAfterRun(string accountId, RunSummary runSummary)
    {
        var account = GetOrCreateAccount(accountId);
        lock (account.Sync)
        {
            EnsureDailyContractsRefreshed(account);
            var dailyContracts = account.State.DailyContracts;
            if (dailyContracts is null || dailyContracts.Contracts.Count == 0)
            {
                return CloneAccountState(account.State);
            }

            var normalizedRunSummary = NormalizeRunSummary(runSummary);

            var didChangeAnyContract = false;
            long kaerosAward = 0;
            var accountXpAward = 0;
            var nextContracts = new List<DailyContractState>(dailyContracts.Contracts.Count);
            foreach (var contractState in dailyContracts.Contracts)
            {
                if (!DailyContractCatalog.ContractById.TryGetValue(contractState.ContractId, out var contractDefinition))
                {
                    nextContracts.Add(contractState);
                    continue;
                }

                if (contractState.IsCompleted)
                {
                    nextContracts.Add(contractState);
                    continue;
                }

                var updatedContractState = EvaluateContractProgress(contractState, contractDefinition, normalizedRunSummary);
                if (updatedContractState != contractState)
                {
                    didChangeAnyContract = true;
                }

                if (!contractState.IsCompleted && updatedContractState.IsCompleted)
                {
                    kaerosAward += contractDefinition.KaerosReward;
                    accountXpAward += contractDefinition.AccountXpReward;
                }

                nextContracts.Add(updatedContractState);
            }

            if (!didChangeAnyContract && kaerosAward <= 0 && accountXpAward <= 0)
            {
                return CloneAccountState(account.State);
            }

            var nextDailyContracts = new DailyContractsState(
                AssignedDate: dailyContracts.AssignedDate,
                Contracts: nextContracts);
            var nextState = account.State with
            {
                DailyContracts = nextDailyContracts,
                KaerosBalance = account.State.KaerosBalance + Math.Max(0, kaerosAward)
            };
            nextState = ApplyAccountXpAward(nextState, accountXpAward);
            account.State = nextState with { Version = account.State.Version + 1 };
            PersistAccount(account);
            return CloneAccountState(account.State);
        }
    }

    public SpendHollowEssenceBarrierResult SpendHollowEssenceForMilestoneBarrier(string accountId, string characterId)
    {
        var account = GetOrCreateAccount(accountId);
        lock (account.Sync)
        {
            EnsureDailyContractsRefreshed(account);
            var character = GetCharacterOrThrow(account.State, characterId);
            if (!IsHollowEssenceBarrierEnabled())
            {
                return new SpendHollowEssenceBarrierResult(
                    Success: false,
                    FailureReason: "Hollow Essence barrier is disabled at the current Mastery level cap.",
                    Account: CloneAccountState(account.State));
            }

            if (character.MasteryLevel != ArenaConfig.MasteryConfig.MilestoneLevelInterval)
            {
                return new SpendHollowEssenceBarrierResult(
                    Success: false,
                    FailureReason: $"Character must be exactly Mastery level {ArenaConfig.MasteryConfig.MilestoneLevelInterval} to unlock this barrier.",
                    Account: CloneAccountState(account.State));
            }

            if (character.HollowEssenceBarrierCleared)
            {
                return new SpendHollowEssenceBarrierResult(
                    Success: false,
                    FailureReason: "Hollow Essence barrier is already unlocked for this character.",
                    Account: CloneAccountState(account.State));
            }

            var materialStacks = new Dictionary<string, long>(character.Inventory.MaterialStacks, StringComparer.Ordinal);
            var currentHollowEssence = materialStacks.GetValueOrDefault(ArenaConfig.MasteryConfig.HollowEssenceId, 0L);
            if (currentHollowEssence < ArenaConfig.MasteryConfig.HollowEssenceCostForMilestone1)
            {
                return new SpendHollowEssenceBarrierResult(
                    Success: false,
                    FailureReason: $"Not enough Hollow Essence. Required {ArenaConfig.MasteryConfig.HollowEssenceCostForMilestone1}, current {currentHollowEssence}.",
                    Account: CloneAccountState(account.State));
            }

            var remainingHollowEssence = currentHollowEssence - ArenaConfig.MasteryConfig.HollowEssenceCostForMilestone1;
            if (remainingHollowEssence <= 0)
            {
                materialStacks.Remove(ArenaConfig.MasteryConfig.HollowEssenceId);
            }
            else
            {
                materialStacks[ArenaConfig.MasteryConfig.HollowEssenceId] = remainingHollowEssence;
            }

            var previousLevel = Math.Clamp(
                character.MasteryLevel,
                1,
                ArenaConfig.MasteryConfig.MasteryLevelCap);
            var nextLevel = ResolveMasteryLevelFromTotalXp(Math.Max(0L, character.MasteryXp), barrierCleared: true);
            var nextUnlockedSigilSlots = ResolveSigilSlotsForMasteryLevel(nextLevel);
            var rewardDelta = ResolveMilestoneRewardDelta(
                previousLevel: previousLevel,
                nextLevel: nextLevel);
            var updatedCharacter = character with
            {
                HollowEssenceBarrierCleared = true,
                MasteryLevel = nextLevel,
                UnlockedSigilSlots = nextUnlockedSigilSlots,
                Inventory = character.Inventory with
                {
                    MaterialStacks = materialStacks
                }
            };

            account.State = UpdateCharacter(account.State, updatedCharacter, versionIncrement: 1) with
            {
                EchoFragmentsBalance = account.State.EchoFragmentsBalance + rewardDelta.EchoFragmentsAward,
                KaerosBalance = account.State.KaerosBalance + rewardDelta.KaerosAward
            };
            PersistAccount(account);
            return new SpendHollowEssenceBarrierResult(
                Success: true,
                FailureReason: null,
                Account: CloneAccountState(account.State));
        }
    }

    public AwardDropsResult AwardDrops(
        string accountId,
        string characterId,
        string battleId,
        IReadOnlyList<DropSource> sources,
        string? runId = null,
        int? battleSeed = null,
        ArenaConfig.ElementalArenaConfig.ElementalArenaDef? elementalArenaDef = null)
    {
        var account = GetOrCreateAccount(accountId);
        lock (account.Sync)
        {
            EnsureDailyContractsRefreshed(account);
            var character = GetCharacterOrThrow(account.State, characterId);
            var equipmentInstances = new Dictionary<string, OwnedEquipmentInstance>(character.Inventory.EquipmentInstances, StringComparer.Ordinal);
            var materialStacks = new Dictionary<string, long>(character.Inventory.MaterialStacks, StringComparer.Ordinal);
            var sigilInventory = new Dictionary<string, SigilInstance>(account.State.SigilInventory, StringComparer.Ordinal);
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
            var normalizedRunId = string.IsNullOrWhiteSpace(runId) ? battleId : runId.Trim();
            foreach (var source in sources)
            {
                var sourceKey = BuildSourceKey(normalizedRunId, source.Tick, source.SourceType, source.SourceId);
                if (alreadyAwardedBySourceKey.TryGetValue(sourceKey, out var existingEvents))
                {
                    awarded.AddRange(existingEvents);
                    continue;
                }

                var killsTotalForSpecies = 0;
                if (IsMobSourceType(source.SourceType))
                {
                    var normalizedSpecies = ResolveSpeciesForDropSource(source);
                    killsTotalForSpecies = bestiaryKillsBySpecies.GetValueOrDefault(normalizedSpecies, 0) + 1;
                }

                var rolledEvents = RollDrops(
                    accountId: account.State.AccountId,
                    characterId: characterId,
                    battleId: battleId,
                    source: source,
                    sourceKey: sourceKey,
                    equipmentInstances: equipmentInstances,
                    sigilInventory: sigilInventory,
                    battleSeed: battleSeed,
                    killsTotalForSpecies: killsTotalForSpecies,
                    zoneIndex: source.ZoneIndex,
                    elementalArenaDef: elementalArenaDef);

                alreadyAwardedBySourceKey[sourceKey] = rolledEvents;
                awarded.AddRange(rolledEvents);
                foreach (var dropEvent in rolledEvents)
                {
                    if (string.Equals(dropEvent.RewardKind, RewardKindMaterial, StringComparison.Ordinal))
                    {
                        materialStacks[dropEvent.ItemId] = materialStacks.GetValueOrDefault(dropEvent.ItemId, 0L) + dropEvent.Quantity;
                    }
                }

                if (IsMobSourceType(source.SourceType))
                {
                    var normalizedSpecies = ResolveSpeciesForDropSource(source);
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
                        MaterialStacks: materialStacks,
                        EquipmentInstances: new Dictionary<string, OwnedEquipmentInstance>(equipmentInstances, StringComparer.Ordinal)),
                    BestiaryKillsBySpecies = new Dictionary<string, int>(bestiaryKillsBySpecies, StringComparer.Ordinal),
                    PrimalCoreBySpecies = new Dictionary<string, int>(primalCoreBySpecies, StringComparer.Ordinal)
                };

                updatedCharacter = EvaluateAscendantUnlocks(updatedCharacter);

                account.State = UpdateAccountAfterDropAward(account.State, updatedCharacter, echoFragmentsBalance);
                account.State = account.State with
                {
                    SigilInventory = new Dictionary<string, SigilInstance>(sigilInventory, StringComparer.Ordinal)
                };
                character = updatedCharacter;
                PersistAccount(account);
            }

            return new AwardDropsResult(
                Awarded: awarded,
                Character: CloneCharacterState(character));
        }
    }

    public BestiaryCraftResult CraftBestiaryItem(string accountId, string speciesId, EquipmentSlot slot, string? characterId = null)
    {
        var account = GetOrCreateAccount(accountId);
        lock (account.Sync)
        {
            EnsureDailyContractsRefreshed(account);
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

            var targetCharacterId = string.IsNullOrWhiteSpace(characterId)
                ? account.State.ActiveCharacterId
                : characterId.Trim();
            if (!account.State.Characters.TryGetValue(targetCharacterId, out var character))
            {
                throw new InvalidOperationException($"Character '{targetCharacterId}' was not found.");
            }

            var craftedItemDefinitionId = AccountCatalog.ResolveCraftedCommonEquipmentItemId(slot);
            var slotLabel = EquipmentSlotMapper.ToCatalogSlot(slot);
            var alreadyCraftedForSpeciesByCharacter =
                account.State.Characters.Values
                    .SelectMany(currentCharacter => currentCharacter.Inventory.EquipmentInstances.Values)
                    .Any(instance =>
                        string.Equals(instance.CraftedByCharacterId, character.CharacterId, StringComparison.Ordinal) &&
                        string.Equals(instance.OriginSpeciesId, normalizedSpeciesId, StringComparison.Ordinal) &&
                        string.Equals(instance.Slot, slotLabel, StringComparison.Ordinal));
            if (alreadyCraftedForSpeciesByCharacter)
            {
                throw new InvalidOperationException(
                    $"Character '{character.CharacterId}' already crafted a {slotLabel} for species '{normalizedSpeciesId}'.");
            }

            // Legacy fallback for pre-metadata crafted items.
            var alreadyOwnsLegacyCraftForSpecies = character.Inventory.EquipmentInstances.Values.Any(instance =>
                string.Equals(instance.DefinitionId, craftedItemDefinitionId, StringComparison.Ordinal) &&
                string.Equals(instance.OriginSpeciesId, normalizedSpeciesId, StringComparison.Ordinal) &&
                string.Equals(instance.Slot, slotLabel, StringComparison.Ordinal));
            if (alreadyOwnsLegacyCraftForSpecies)
            {
                throw new InvalidOperationException(
                    $"Character '{character.CharacterId}' already crafted a {slotLabel} for species '{normalizedSpeciesId}'.");
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

            var craftedInstanceId = DeterministicSeed.HashId(
                "craft",
                account.State.AccountId,
                character.CharacterId,
                normalizedSpeciesId,
                slotLabel,
                "1");
            var craftedItem = new OwnedEquipmentInstance(
                InstanceId: craftedInstanceId,
                DefinitionId: craftedItemDefinitionId,
                IsLocked: false,
                OriginSpeciesId: normalizedSpeciesId,
                Slot: slotLabel,
                Rarity: CraftedRarityCommon,
                CraftedByCharacterId: character.CharacterId,
                CraftedByCharacterName: character.Name);

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
            PersistAccount(account);
            return new BestiaryCraftResult(
                Account: CloneAccountState(account.State),
                Character: CloneCharacterState(updatedCharacter),
                CraftedItem: craftedItem);
        }
    }

    public ItemRefineResult RefineItem(string accountId, string itemInstanceId, string? characterId = null)
    {
        var account = GetOrCreateAccount(accountId);
        lock (account.Sync)
        {
            EnsureDailyContractsRefreshed(account);
            if (string.IsNullOrWhiteSpace(itemInstanceId))
            {
                throw new InvalidOperationException("itemInstanceId is required.");
            }

            var targetCharacterId = string.IsNullOrWhiteSpace(characterId)
                ? account.State.ActiveCharacterId
                : characterId.Trim();
            if (!account.State.Characters.TryGetValue(targetCharacterId, out var character))
            {
                throw new InvalidOperationException($"Character '{targetCharacterId}' was not found.");
            }

            if (!character.Inventory.EquipmentInstances.TryGetValue(itemInstanceId, out var item))
            {
                throw new InvalidOperationException($"Character does not own item instance '{itemInstanceId}'.");
            }

            var craftedByCharacterId = item.CraftedByCharacterId?.Trim();
            if (!string.IsNullOrWhiteSpace(craftedByCharacterId) &&
                !string.Equals(craftedByCharacterId, character.CharacterId, StringComparison.Ordinal))
            {
                throw new InvalidOperationException(
                    $"Bestiary-forged weapons are bound to their creator. Item '{itemInstanceId}' can only be refined by '{craftedByCharacterId}'.");
            }

            var normalizedSpecies = NormalizeSpeciesOrNull(item.OriginSpeciesId);
            if (normalizedSpecies is null)
            {
                throw new InvalidOperationException("Item is not linked to a species and cannot be refined.");
            }

            var requestedItemSlot = ResolveItemSlot(item);
            var strongestItemInLine = character.Inventory.EquipmentInstances.Values
                .Where(candidate =>
                    string.Equals(candidate.DefinitionId, item.DefinitionId, StringComparison.Ordinal) &&
                    string.Equals(NormalizeSpeciesOrNull(candidate.OriginSpeciesId), normalizedSpecies, StringComparison.Ordinal) &&
                    string.Equals(ResolveItemSlot(candidate), requestedItemSlot, StringComparison.Ordinal))
                .OrderByDescending(candidate => ResolveRarityWeight(ResolveItemRarity(candidate)))
                .ThenByDescending(candidate => string.Equals(candidate.InstanceId, character.Equipment.WeaponInstanceId, StringComparison.Ordinal))
                .ThenBy(candidate => candidate.InstanceId, StringComparer.Ordinal)
                .FirstOrDefault();
            if (strongestItemInLine is not null &&
                !string.Equals(strongestItemInLine.InstanceId, item.InstanceId, StringComparison.Ordinal))
            {
                throw new InvalidOperationException(
                    $"Only one weapon per species can be refined. Refine '{strongestItemInLine.InstanceId}' first.");
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
            PersistAccount(account);
            return new ItemRefineResult(
                Account: CloneAccountState(account.State),
                Character: CloneCharacterState(updatedCharacter),
                RefinedItem: updatedItem);
        }
    }

    public CharacterState EnchantWeapon(string accountId, string characterId, string weaponInstanceId, string slot, string materialId)
    {
        var account = GetOrCreateAccount(accountId);
        lock (account.Sync)
        {
            EnsureDailyContractsRefreshed(account);

            if (string.IsNullOrWhiteSpace(weaponInstanceId))
                throw new InvalidOperationException("weaponInstanceId is required.");

            if (string.IsNullOrWhiteSpace(materialId))
                throw new InvalidOperationException("materialId is required.");

            if (!account.State.Characters.TryGetValue(characterId, out var character))
                throw new InvalidOperationException($"Character '{characterId}' was not found.");

            var normalizedWeaponInstanceId = weaponInstanceId.Trim();
            var equippedWeaponInstanceId = character.Equipment.WeaponInstanceId;
            if (!string.Equals(equippedWeaponInstanceId, normalizedWeaponInstanceId, StringComparison.Ordinal))
                throw new InvalidOperationException("Only the currently equipped weapon can be enchanted.");

            if (!character.Inventory.EquipmentInstances.TryGetValue(normalizedWeaponInstanceId, out var weapon))
                throw new InvalidOperationException($"Weapon instance '{normalizedWeaponInstanceId}' not found in inventory.");

            var normalizedSlot = slot.Trim().ToLowerInvariant();
            var normalizedMaterialId = materialId.Trim();

            bool isDamageSlot;
            ElementType enchantElement;
            int cost;

            if (string.Equals(normalizedSlot, "damage", StringComparison.Ordinal))
            {
                if (!ArenaConfig.EnchantmentConfig.CoreToElement.TryGetValue(normalizedMaterialId, out enchantElement))
                    throw new InvalidOperationException($"Material '{normalizedMaterialId}' is not a valid Elemental Core.");
                isDamageSlot = true;
                cost = ArenaConfig.EnchantmentConfig.CoreCostPerEnchant;
            }
            else if (string.Equals(normalizedSlot, "resistance", StringComparison.Ordinal))
            {
                if (!ArenaConfig.EnchantmentConfig.DustToElement.TryGetValue(normalizedMaterialId, out enchantElement))
                    throw new InvalidOperationException($"Material '{normalizedMaterialId}' is not a valid Elemental Dust.");
                isDamageSlot = false;
                cost = ArenaConfig.EnchantmentConfig.DustCostPerEnchant;
            }
            else
            {
                throw new InvalidOperationException($"Invalid enchantment slot '{slot}'. Expected 'damage' or 'resistance'.");
            }

            var materialStacks = new Dictionary<string, long>(character.Inventory.MaterialStacks, StringComparer.Ordinal);
            var currentMaterialBalance = materialStacks.GetValueOrDefault(normalizedMaterialId, 0L);
            if (currentMaterialBalance < cost)
                throw new InvalidOperationException(
                    $"Not enough '{normalizedMaterialId}'. Required {cost}, current {currentMaterialBalance}.");

            materialStacks[normalizedMaterialId] = currentMaterialBalance - cost;

            var updatedWeapon = isDamageSlot
                ? weapon with { DamageElementEnchant = enchantElement }
                : weapon with { ResistanceElementEnchant = enchantElement };

            var equipmentInstances = new Dictionary<string, OwnedEquipmentInstance>(
                character.Inventory.EquipmentInstances, StringComparer.Ordinal)
            {
                [normalizedWeaponInstanceId] = updatedWeapon
            };

            var updatedCharacter = character with
            {
                Inventory = new CharacterInventory(
                    MaterialStacks: materialStacks,
                    EquipmentInstances: equipmentInstances)
            };

            account.State = UpdateAccountAfterDropAward(account.State, updatedCharacter, account.State.EchoFragmentsBalance);
            PersistAccount(account);
            return CloneCharacterState(updatedCharacter);
        }
    }

    private static List<DropEvent> RollDrops(
        string accountId,
        string characterId,
        string battleId,
        DropSource source,
        string sourceKey,
        IDictionary<string, OwnedEquipmentInstance> equipmentInstances,
        IDictionary<string, SigilInstance> sigilInventory,
        int? battleSeed,
        int killsTotalForSpecies,
        int zoneIndex,
        ArenaConfig.ElementalArenaConfig.ElementalArenaDef? elementalArenaDef = null)
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

        if (IsMobSourceType(normalizedSourceType) && elementalArenaDef is not null)
        {
            if (rng.Next(100) < elementalArenaDef.CoreDropChancePercent)
            {
                events.Add(new DropEvent(
                    DropEventId: DeterministicSeed.HashId("dropevt", accountId, characterId, sourceKey, elementalArenaDef.CoreMaterialId, "core"),
                    AccountId: accountId,
                    CharacterId: characterId,
                    BattleId: battleId,
                    Tick: source.Tick,
                    SourceType: normalizedSourceType,
                    SourceId: source.SourceId,
                    ItemId: elementalArenaDef.CoreMaterialId,
                    Quantity: 1,
                    EquipmentInstanceId: null,
                    RewardKind: RewardKindMaterial,
                    Species: normalizedSpecies,
                    AwardedAtUtc: nowUtc));
            }

            if (rng.Next(100) < elementalArenaDef.DustDropChancePercent)
            {
                events.Add(new DropEvent(
                    DropEventId: DeterministicSeed.HashId("dropevt", accountId, characterId, sourceKey, elementalArenaDef.DustMaterialId, "dust"),
                    AccountId: accountId,
                    CharacterId: characterId,
                    BattleId: battleId,
                    Tick: source.Tick,
                    SourceType: normalizedSourceType,
                    SourceId: source.SourceId,
                    ItemId: elementalArenaDef.DustMaterialId,
                    Quantity: 1,
                    EquipmentInstanceId: null,
                    RewardKind: RewardKindMaterial,
                    Species: normalizedSpecies,
                    AwardedAtUtc: nowUtc));
            }

            return events;
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

            var sigilSpecies = NormalizeSpecies(source.Species);
            if (ArenaConfig.SigilConfig.IsValidSpeciesId(sigilSpecies) &&
                rng.Next(100) < ArenaConfig.SigilConfig.SigilDropChancePercent)
            {
                var (sigilMin, sigilMax) = ArenaConfig.SigilConfig.GetSigilLevelRangeForZone(zoneIndex);
                var sigilLevel = rng.Next(sigilMin, sigilMax + 1);
                var slotIndex = SigilSlotResolver.ResolveSlotIndexForLevel(sigilLevel);
                var sigilInstanceId = $"sigil_{Guid.NewGuid():N}";
                sigilInventory[sigilInstanceId] = new SigilInstance(
                    InstanceId: sigilInstanceId,
                    SpeciesId: sigilSpecies,
                    SigilLevel: sigilLevel,
                    SlotIndex: slotIndex,
                    DefinitionId: ArenaConfig.SigilConfig.ResolveDefinitionIdForSpeciesId(sigilSpecies),
                    IsLocked: false);

                events.Add(new DropEvent(
                    DropEventId: DeterministicSeed.HashId("dropevt", accountId, characterId, sourceKey, sigilInstanceId, "sigil"),
                    AccountId: accountId,
                    CharacterId: characterId,
                    BattleId: battleId,
                    Tick: source.Tick,
                    SourceType: normalizedSourceType,
                    SourceId: source.SourceId,
                    ItemId: sigilInstanceId,
                    Quantity: 1,
                    EquipmentInstanceId: null,
                    RewardKind: RewardKindSigil,
                    Species: sigilSpecies,
                    AwardedAtUtc: nowUtc,
                    SigilLevel: sigilLevel,
                    SlotIndex: slotIndex));
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

    private static int ResolveRarityWeight(string rarity)
    {
        return rarity switch
        {
            "ascendant" => 5,
            "legendary" => 4,
            "epic" => 3,
            "rare" => 2,
            "common" => 1,
            _ => 0
        };
    }

    private static string ResolveItemSlot(OwnedEquipmentInstance item)
    {
        if (!string.IsNullOrWhiteSpace(item.Slot))
        {
            return item.Slot.Trim().ToLowerInvariant();
        }

        if (AccountCatalog.TryGetEquipment(item.DefinitionId, out var equipmentDefinition) &&
            !string.IsNullOrWhiteSpace(equipmentDefinition.Slot))
        {
            return equipmentDefinition.Slot.Trim().ToLowerInvariant();
        }

        return string.Empty;
    }

    private static bool IsBestiaryForgedWeapon(OwnedEquipmentInstance item)
    {
        if (NormalizeSpeciesOrNull(item.OriginSpeciesId) is null)
        {
            return false;
        }

        var forgedWeaponDefinitionId = AccountCatalog.ResolveCraftedCommonEquipmentItemId(EquipmentSlot.Weapon);
        return string.Equals(item.DefinitionId, forgedWeaponDefinitionId, StringComparison.Ordinal);
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

    private static int ResolveEchoFragmentsAward(string sourceType, string? species)
    {
        _ = species;
        if (string.Equals(NormalizeSourceType(sourceType), "mimic", StringComparison.Ordinal))
        {
            return ArenaConfig.MimicConfig.EchoFragmentsBonusDrop;
        }

        return IsMobSourceType(sourceType) ? EchoFragmentsPerMobKill : 0;
    }

    private void EnsureDailyContractsRefreshed(StoredAccount account)
    {
        var todayUtc = DateOnly.FromDateTime(DateTime.UtcNow);
        if (account.State.DailyContracts is not null &&
            account.State.DailyContracts.AssignedDate >= todayUtc)
        {
            return;
        }

        account.State = account.State with
        {
            DailyContracts = BuildDailyContractsState(account.State.AccountId, todayUtc),
            Version = account.State.Version + 1
        };
        PersistAccount(account);
    }

    private static DailyContractsState BuildDailyContractsState(string accountId, DateOnly assignedDate)
    {
        var pool = DailyContractCatalog.ContractPool;
        var contractCount = Math.Min(ArenaConfig.ContractConfig.DailyContractCount, pool.Count);
        var normalizedAccountId = string.IsNullOrWhiteSpace(accountId) ? "dev_account" : accountId.Trim();
        var rngSeed = DeterministicSeed.FromParts(
            "daily_contracts",
            normalizedAccountId,
            assignedDate.ToString("yyyy-MM-dd"));
        var rng = new Random(rngSeed);
        var selectedContracts = new List<ContractDefinition>(contractCount);
        if (DailyContractCatalog.TryResolveDailyElementContract(assignedDate, out var dailyElementContract))
        {
            selectedContracts.Add(dailyElementContract);
        }

        var remainingSlots = Math.Max(0, contractCount - selectedContracts.Count);
        var randomizedPool = pool
            .Where(definition => selectedContracts.All(selected => !string.Equals(selected.ContractId, definition.ContractId, StringComparison.Ordinal)))
            .OrderBy(_ => rng.Next())
            .Take(remainingSlots);
        selectedContracts.AddRange(randomizedPool);

        var contractStates = selectedContracts
            .Select(definition => new DailyContractState(
                ContractId: definition.ContractId,
                IsCompleted: false,
                CurrentProgress: 0,
                AssignedDate: assignedDate))
            .ToList();

        return new DailyContractsState(
            AssignedDate: assignedDate,
            Contracts: contractStates);
    }

    private static RunSummary NormalizeRunSummary(RunSummary runSummary)
    {
        return new RunSummary(
            KillCount: Math.Max(0, runSummary.KillCount),
            EliteKillCount: Math.Max(0, runSummary.EliteKillCount),
            ChestsOpened: Math.Max(0, runSummary.ChestsOpened),
            RunLevel: Math.Max(0, runSummary.RunLevel),
            RunCompleted: runSummary.RunCompleted);
    }

    private static DailyContractState EvaluateContractProgress(
        DailyContractState contractState,
        ContractDefinition definition,
        RunSummary runSummary)
    {
        var targetValue = Math.Max(1, definition.TargetValue);
        var currentProgress = Math.Max(0, contractState.CurrentProgress);
        var isCompleted = contractState.IsCompleted;

        switch (definition.Type)
        {
            case ArenaConfig.ContractConfig.TypeCompleteRun:
                if (runSummary.RunCompleted)
                {
                    currentProgress += 1;
                    isCompleted = currentProgress >= targetValue;
                }

                break;

            case ArenaConfig.ContractConfig.TypeReachRunLevel:
                if (runSummary.RunCompleted)
                {
                    currentProgress = Math.Max(currentProgress, runSummary.RunLevel);
                    isCompleted = currentProgress >= targetValue;
                }

                break;

            case ArenaConfig.ContractConfig.TypeKillCount:
                currentProgress += runSummary.KillCount;
                isCompleted = currentProgress >= targetValue;
                break;

            case ArenaConfig.ContractConfig.TypeOpenChests:
                currentProgress += runSummary.ChestsOpened;
                isCompleted = currentProgress >= targetValue;
                break;

            case ArenaConfig.ContractConfig.TypeKillElites:
                currentProgress += runSummary.EliteKillCount;
                isCompleted = currentProgress >= targetValue;
                break;

            case ArenaConfig.ContractConfig.TypeDailyElementRun:
                if (runSummary.RunCompleted)
                {
                    currentProgress += 1;
                    isCompleted = currentProgress >= targetValue;
                }

                break;
        }

        var normalizedProgress = isCompleted
            ? Math.Max(targetValue, currentProgress)
            : currentProgress;
        return contractState with
        {
            IsCompleted = isCompleted,
            CurrentProgress = normalizedProgress
        };
    }

    private static AccountState ApplyAccountXpAward(AccountState state, int xpAmount)
    {
        var safeXpAmount = Math.Max(0, xpAmount);
        if (safeXpAmount == 0)
        {
            return state;
        }

        var currentAccountXp = Math.Max(0L, state.AccountXp);
        long nextAccountXp;
        try
        {
            nextAccountXp = checked(currentAccountXp + safeXpAmount);
        }
        catch (OverflowException)
        {
            nextAccountXp = long.MaxValue;
        }

        var accountXpAtCap = ResolveTotalAccountXpRequiredToReachLevel(ArenaConfig.ZoneConfig.AccountLevelCap);
        var cappedAccountXp = Math.Min(nextAccountXp, accountXpAtCap);
        var nextAccountLevel = ResolveAccountLevelFromTotalXp(cappedAccountXp);
        if (cappedAccountXp == state.AccountXp && nextAccountLevel == state.AccountLevel)
        {
            return state;
        }

        return state with
        {
            AccountXp = cappedAccountXp,
            AccountLevel = nextAccountLevel
        };
    }

    private static long ResolveTotalXpRequiredToReachLevel(int targetLevelInclusive)
    {
        var cappedTargetLevel = Math.Clamp(
            targetLevelInclusive,
            1,
            ArenaConfig.MasteryConfig.MasteryLevelCap);
        long total = 0;
        for (var level = 1; level < cappedTargetLevel; level += 1)
        {
            total += ResolveMasteryXpRequiredForLevel(level);
        }

        return total;
    }

    private static int ResolveMasteryXpRequiredForLevel(int level)
    {
        var safeLevel = Math.Max(1, level);
        return (safeLevel * ArenaConfig.MasteryConfig.XpRequiredPerLevelMultiplier) +
               ArenaConfig.MasteryConfig.XpRequiredPerLevelBase;
    }

    private static int ResolveMasteryLevelFromTotalXp(long totalXp, bool barrierCleared)
    {
        var safeXp = Math.Max(0L, totalXp);
        var level = 1;
        var remainingXp = safeXp;
        var levelCap = ArenaConfig.MasteryConfig.MasteryLevelCap;
        var barrierApplies = IsHollowEssenceBarrierEnabled();

        while (level < levelCap)
        {
            if (barrierApplies && level == ArenaConfig.MasteryConfig.MilestoneLevelInterval && !barrierCleared)
            {
                break;
            }

            var requiredXp = ResolveMasteryXpRequiredForLevel(level);
            if (remainingXp < requiredXp)
            {
                break;
            }

            remainingXp -= requiredXp;
            level += 1;
        }

        return Math.Clamp(level, 1, levelCap);
    }

    private static bool IsHollowEssenceBarrierEnabled()
    {
        return ArenaConfig.MasteryConfig.MasteryLevelCap > ArenaConfig.MasteryConfig.MilestoneLevelInterval;
    }

    private static int ResolveSigilSlotsForMasteryLevel(int masteryLevel)
    {
        var safeMasteryLevel = Math.Clamp(
            masteryLevel,
            1,
            ArenaConfig.MasteryConfig.MasteryLevelCap);
        var unlockedSigilSlots = ArenaConfig.MasteryConfig.InitialUnlockedSigilSlots;

        foreach (var unlockEntry in ArenaConfig.MasteryConfig.SigilSlotUnlockAtLevel.OrderBy(entry => entry.Key))
        {
            if (safeMasteryLevel < unlockEntry.Key)
            {
                break;
            }

            unlockedSigilSlots = Math.Max(unlockedSigilSlots, unlockEntry.Value);
        }

        return Math.Clamp(
            unlockedSigilSlots,
            ArenaConfig.MasteryConfig.InitialUnlockedSigilSlots,
            ArenaConfig.MasteryConfig.MaxUnlockedSigilSlots);
    }

    private static long ResolveTotalAccountXpRequiredToReachLevel(int targetLevelInclusive)
    {
        var cappedTargetLevel = Math.Clamp(
            targetLevelInclusive,
            1,
            ArenaConfig.ZoneConfig.AccountLevelCap);
        long total = 0;
        for (var level = 1; level < cappedTargetLevel; level += 1)
        {
            total += ArenaConfig.ZoneConfig.XpRequiredForLevel(level);
        }

        return total;
    }

    private static int ResolveAccountLevelFromTotalXp(long totalXp)
    {
        var safeXp = Math.Max(0L, totalXp);
        var level = 1;
        var remainingXp = safeXp;
        var levelCap = ArenaConfig.ZoneConfig.AccountLevelCap;

        while (level < levelCap)
        {
            var requiredXp = ArenaConfig.ZoneConfig.XpRequiredForLevel(level);
            if (remainingXp < requiredXp)
            {
                break;
            }

            remainingXp -= requiredXp;
            level += 1;
        }

        return Math.Clamp(level, 1, levelCap);
    }

    private static MilestoneRewardDelta ResolveMilestoneRewardDelta(
        int previousLevel,
        int nextLevel)
    {
        if (nextLevel <= previousLevel)
        {
            return new MilestoneRewardDelta(
                KaerosAward: 0L,
                EchoFragmentsAward: 0L);
        }

        long kaerosAward = 0;
        long echoFragmentsAward = 0;

        for (var milestoneIndex = 0; milestoneIndex < ArenaConfig.MasteryConfig.KaerosRewardPerMilestone.Length; milestoneIndex += 1)
        {
            var milestoneLevel = (milestoneIndex + 1) * ArenaConfig.MasteryConfig.MilestoneLevelInterval;
            if (previousLevel >= milestoneLevel || nextLevel < milestoneLevel)
            {
                continue;
            }

            kaerosAward += ArenaConfig.MasteryConfig.KaerosRewardPerMilestone[milestoneIndex];
            echoFragmentsAward += ArenaConfig.MasteryConfig.EchoFragmentsRewardPerMilestone[milestoneIndex];
        }

        return new MilestoneRewardDelta(
            KaerosAward: kaerosAward,
            EchoFragmentsAward: echoFragmentsAward);
    }

    private static void ValidateSigilSlotIndex(int slotIndex)
    {
        if (!ArenaConfig.SigilConfig.IsValidSlotIndex(slotIndex))
        {
            throw new InvalidOperationException(
                $"slotIndex must be between 1 and {ArenaConfig.SigilConfig.SlotLevelRanges.Length}.");
        }
    }

    private static readonly IReadOnlyList<string> PlayableCharacterIds =
    [
        ArenaConfig.CharacterIds.Mirai,
        ArenaConfig.CharacterIds.Sylwen,
        ArenaConfig.CharacterIds.Velvet
    ];

    private static bool IsPlayableCharacterId(string characterId)
    {
        return PlayableCharacterIds.Contains(characterId, StringComparer.Ordinal);
    }

    private static bool IsNonPlayableCharacterId(string characterId)
    {
        return !string.IsNullOrWhiteSpace(characterId) && !IsPlayableCharacterId(characterId);
    }

    private static bool NeedsMigration(AccountState state)
    {
        const string legacySpeciesId = "ranged_dragon";
        if (state.Characters.Values.Any(character =>
                character.BestiaryKillsBySpecies.ContainsKey(legacySpeciesId) ||
                character.PrimalCoreBySpecies.ContainsKey(legacySpeciesId)))
        {
            return true;
        }

        if (IsNonPlayableCharacterId(state.ActiveCharacterId))
        {
            return true;
        }

        if (state.Characters.Keys.Any(IsNonPlayableCharacterId))
        {
            return true;
        }

        return false;
    }

    private static AccountState NormalizeLoadedAccountState(AccountState state)
    {
        state = MigrateRangedDragonToShaman(state);
        state = MigrateLegacyCharacters(state);
        var changed = false;

        var accountXpAtCap = ResolveTotalAccountXpRequiredToReachLevel(ArenaConfig.ZoneConfig.AccountLevelCap);
        var normalizedAccountXp = Math.Clamp(Math.Max(0L, state.AccountXp), 0L, accountXpAtCap);
        var normalizedAccountLevel = ResolveAccountLevelFromTotalXp(normalizedAccountXp);
        if (normalizedAccountXp != state.AccountXp || normalizedAccountLevel != state.AccountLevel)
        {
            state = state with
            {
                AccountXp = normalizedAccountXp,
                AccountLevel = normalizedAccountLevel
            };
            changed = true;
        }

        var normalizedCharacters = new Dictionary<string, CharacterState>(state.Characters.Count, StringComparer.Ordinal);
        foreach (var (characterId, character) in state.Characters)
        {
            var masteryXpAtCap = ResolveTotalXpRequiredToReachLevel(ArenaConfig.MasteryConfig.MasteryLevelCap);
            var normalizedMasteryXp = Math.Clamp(Math.Max(0L, character.MasteryXp), 0L, masteryXpAtCap);
            var normalizedMasteryLevel = ResolveMasteryLevelFromTotalXp(normalizedMasteryXp, character.HollowEssenceBarrierCleared);
            var normalizedUnlockedSigilSlots = ResolveSigilSlotsForMasteryLevel(normalizedMasteryLevel);
            var normalizedCharacter = character with
            {
                MasteryXp = normalizedMasteryXp,
                MasteryLevel = normalizedMasteryLevel,
                UnlockedSigilSlots = normalizedUnlockedSigilSlots
            };
            normalizedCharacters[characterId] = normalizedCharacter;
            if (normalizedCharacter != character)
            {
                changed = true;
            }
        }

        if (changed)
        {
            state = state with
            {
                Characters = normalizedCharacters
            };
        }

        if (state.SigilInventory.Count == 0)
        {
            return state;
        }

        var normalizedSigilInventory = new Dictionary<string, SigilInstance>(StringComparer.Ordinal);
        var sigilsChanged = false;
        foreach (var (instanceId, sigil) in state.SigilInventory)
        {
            var normalizedSigil = NormalizeSigilInstance(instanceId, sigil);
            normalizedSigilInventory[instanceId] = normalizedSigil;
            if (normalizedSigil != sigil)
            {
                sigilsChanged = true;
            }
        }

        if (!sigilsChanged)
        {
            return state;
        }

        return state with
        {
            SigilInventory = normalizedSigilInventory
        };
    }

    private static AccountState MigrateRangedDragonToShaman(AccountState state)
    {
        const string legacySpeciesId = "ranged_dragon";
        var targetSpeciesId = ArenaConfig.SpeciesIds.RangedShaman;

        var characters = new Dictionary<string, CharacterState>(state.Characters, StringComparer.Ordinal);
        var anyChanged = false;

        foreach (var (charId, character) in state.Characters)
        {
            if (!character.BestiaryKillsBySpecies.ContainsKey(legacySpeciesId) &&
                !character.PrimalCoreBySpecies.ContainsKey(legacySpeciesId))
            {
                continue;
            }

            var bestiary = new Dictionary<string, int>(character.BestiaryKillsBySpecies, StringComparer.Ordinal);
            var primalCore = new Dictionary<string, int>(character.PrimalCoreBySpecies, StringComparer.Ordinal);

            if (bestiary.TryGetValue(legacySpeciesId, out var dragonKills))
            {
                bestiary.Remove(legacySpeciesId);
                bestiary[targetSpeciesId] = bestiary.GetValueOrDefault(targetSpeciesId, 0) + dragonKills;
            }

            if (primalCore.TryGetValue(legacySpeciesId, out var dragonCore))
            {
                primalCore.Remove(legacySpeciesId);
                primalCore[targetSpeciesId] = primalCore.GetValueOrDefault(targetSpeciesId, 0) + dragonCore;
            }

            characters[charId] = character with
            {
                BestiaryKillsBySpecies = bestiary,
                PrimalCoreBySpecies = primalCore
            };
            anyChanged = true;
        }

        if (!anyChanged)
        {
            return state;
        }

        return state with { Characters = characters };
    }

    private static AccountState MigrateLegacyCharacters(AccountState state)
    {
        var anyChanged = false;

        // Remove non-playable character entries.
        var characters = new Dictionary<string, CharacterState>(state.Characters, StringComparer.Ordinal);
        foreach (var nonPlayableId in characters.Keys.Where(IsNonPlayableCharacterId).ToArray())
        {
            if (characters.Remove(nonPlayableId))
            {
                anyChanged = true;
            }
        }

        // Seed any missing playable characters with fresh state.
        var seeded = CreateSeededAccount(state.AccountId);
        foreach (var playableId in PlayableCharacterIds)
        {
            if (!characters.ContainsKey(playableId) &&
                seeded.Characters.TryGetValue(playableId, out var seededCharacter))
            {
                characters[playableId] = seededCharacter;
                anyChanged = true;
            }
        }

        // Remap legacy activeCharacterId to Mirai.
        var activeCharacterId = state.ActiveCharacterId;
        if (IsNonPlayableCharacterId(activeCharacterId) ||
            !characters.ContainsKey(activeCharacterId))
        {
            activeCharacterId = ArenaConfig.CharacterIds.Mirai;
            anyChanged = true;
        }

        if (!anyChanged)
        {
            return state;
        }

        return state with
        {
            ActiveCharacterId = activeCharacterId,
            Characters = characters
        };
    }

    private static SigilInstance NormalizeSigilInstance(string instanceId, SigilInstance sigil)
    {
        var normalizedInstanceId = string.IsNullOrWhiteSpace(instanceId)
            ? sigil.InstanceId.Trim()
            : instanceId.Trim();

        var normalizedSpeciesId = NormalizeSpecies(sigil.SpeciesId);
        var normalizedLevel = Math.Max(1, sigil.SigilLevel);
        var normalizedSlotIndex = sigil.SlotIndex;
        try
        {
            normalizedSlotIndex = SigilSlotResolver.ResolveSlotIndexForLevel(normalizedLevel);
        }
        catch (InvalidOperationException)
        {
            if (!ArenaConfig.SigilConfig.IsValidSlotIndex(normalizedSlotIndex))
            {
                normalizedSlotIndex = 1;
            }
        }

        var normalizedDefinitionId = string.IsNullOrWhiteSpace(sigil.DefinitionId)
            ? ArenaConfig.SigilConfig.ResolveDefinitionIdForSpeciesId(normalizedSpeciesId)
            : sigil.DefinitionId.Trim();

        return sigil with
        {
            InstanceId = normalizedInstanceId,
            SpeciesId = normalizedSpeciesId,
            SigilLevel = normalizedLevel,
            SlotIndex = normalizedSlotIndex,
            DefinitionId = normalizedDefinitionId
        };
    }

    private static IReadOnlyDictionary<string, SigilInstance> BuildSeedSigilInventory()
    {
        var slotIndex = SigilSlotResolver.ResolveSlotIndexForLevel(SeedSigilLevel);
        return new Dictionary<string, SigilInstance>(StringComparer.Ordinal)
        {
            [SeedSigilInstanceId] = new SigilInstance(
                InstanceId: SeedSigilInstanceId,
                SpeciesId: SeedSigilSpeciesId,
                SigilLevel: SeedSigilLevel,
                SlotIndex: slotIndex,
                DefinitionId: ArenaConfig.SigilConfig.ResolveDefinitionIdForSpeciesId(SeedSigilSpeciesId),
                IsLocked: false)
        };
    }

    private static bool IsMobSourceType(string sourceType)
    {
        return string.Equals(NormalizeSourceType(sourceType), "mob", StringComparison.Ordinal);
    }

    private static string ResolveSpeciesForDropSource(DropSource source)
    {
        var normalizedSpecies = NormalizeSpeciesOrNull(source.Species);
        if (!string.IsNullOrWhiteSpace(normalizedSpecies))
        {
            return normalizedSpecies;
        }

        if (!string.IsNullOrWhiteSpace(source.SourceId) &&
            source.SourceId.StartsWith("boss:", StringComparison.OrdinalIgnoreCase))
        {
            return source.SourceId.Trim().ToLowerInvariant();
        }

        return UnknownSpeciesId;
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

    private static string BuildSourceKey(string runId, int tick, string sourceType, string sourceId)
    {
        return $"{runId}:{tick}:{NormalizeSourceType(sourceType)}:{sourceId}";
    }

    private static string NormalizeSourceType(string sourceType)
    {
        if (string.Equals(sourceType, "chest", StringComparison.OrdinalIgnoreCase))
        {
            return "chest";
        }

        if (string.Equals(sourceType, "mimic", StringComparison.OrdinalIgnoreCase))
        {
            return "mimic";
        }

        return "mob";
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

    private static CharacterState EvaluateAscendantUnlocks(CharacterState character)
    {
        var ascendantUnlocked = new Dictionary<int, bool>(character.AscendantSigilSlotsUnlocked);
        var changed = false;
        var maxRankThreshold = ArenaConfig.BestiaryConfig.RankKillThresholds[ArenaConfig.BestiaryConfig.MaxRank - 1];

        for (var tierIndex = 0; tierIndex < ArenaConfig.BestiaryConfig.TierSpecies.Length; tierIndex++)
        {
            var tierSpecies = ArenaConfig.BestiaryConfig.TierSpecies[tierIndex];
            if (tierSpecies.Length == 0)
            {
                continue;
            }

            if (ascendantUnlocked.TryGetValue(tierIndex, out var alreadyUnlocked) && alreadyUnlocked)
            {
                continue;
            }

            var allAtMaxRank = tierSpecies.All(speciesId =>
                character.BestiaryKillsBySpecies.TryGetValue(speciesId, out var kills) &&
                kills >= maxRankThreshold);

            if (!allAtMaxRank)
            {
                continue;
            }

            ascendantUnlocked[tierIndex] = true;
            changed = true;
        }

        if (!changed)
        {
            return character;
        }

        return character with { AscendantSigilSlotsUnlocked = ascendantUnlocked };
    }

    private static AccountState UpdateAccountAfterDropAward(AccountState account, CharacterState updatedCharacter, long echoFragmentsBalance)
    {
        return UpdateCharacter(account, updatedCharacter, versionIncrement: 1) with
        {
            EchoFragmentsBalance = echoFragmentsBalance
        };
    }

    private void PersistAccount(StoredAccount account)
    {
        _persistence.Save(new PersistedAccountData(
            State: CloneAccountState(account.State),
            AwardedBySourceKeyByCharacter: CloneAwardedBySourceKeyByCharacterForPersistence(
                account.AwardedBySourceKeyByCharacter)));
    }

    private static Dictionary<string, Dictionary<string, IReadOnlyList<DropEvent>>> CloneAwardedBySourceKeyByCharacter(
        IReadOnlyDictionary<string, Dictionary<string, List<DropEvent>>>? source)
    {
        var clonedByCharacter = new Dictionary<string, Dictionary<string, IReadOnlyList<DropEvent>>>(StringComparer.Ordinal);
        if (source is null)
        {
            return clonedByCharacter;
        }

        foreach (var (characterId, awardedBySource) in source)
        {
            if (string.IsNullOrWhiteSpace(characterId))
            {
                continue;
            }

            var clonedBySource = new Dictionary<string, IReadOnlyList<DropEvent>>(StringComparer.Ordinal);
            foreach (var (sourceKey, events) in awardedBySource)
            {
                if (string.IsNullOrWhiteSpace(sourceKey))
                {
                    continue;
                }

                clonedBySource[sourceKey] = events?.ToList() ?? [];
            }

            clonedByCharacter[characterId] = clonedBySource;
        }

        return clonedByCharacter;
    }

    private static Dictionary<string, Dictionary<string, List<DropEvent>>> CloneAwardedBySourceKeyByCharacterForPersistence(
        IReadOnlyDictionary<string, Dictionary<string, IReadOnlyList<DropEvent>>>? source)
    {
        var clonedByCharacter = new Dictionary<string, Dictionary<string, List<DropEvent>>>(StringComparer.Ordinal);
        if (source is null)
        {
            return clonedByCharacter;
        }

        foreach (var (characterId, awardedBySource) in source)
        {
            if (string.IsNullOrWhiteSpace(characterId))
            {
                continue;
            }

            var clonedBySource = new Dictionary<string, List<DropEvent>>(StringComparer.Ordinal);
            foreach (var (sourceKey, events) in awardedBySource)
            {
                if (string.IsNullOrWhiteSpace(sourceKey))
                {
                    continue;
                }

                clonedBySource[sourceKey] = events?.ToList() ?? [];
            }

            clonedByCharacter[characterId] = clonedBySource;
        }

        return clonedByCharacter;
    }

    private StoredAccount GetOrCreateAccount(string accountId)
    {
        var normalizedAccountId = string.IsNullOrWhiteSpace(accountId) ? "dev_account" : accountId.Trim();
        var account = _accounts.GetOrAdd(
            normalizedAccountId,
            static id => new StoredAccount(
                state: CreateSeededAccount(id),
                awardedBySourceKeyByCharacter: new Dictionary<string, Dictionary<string, IReadOnlyList<DropEvent>>>(
                    StringComparer.Ordinal)));
        EnsureCatalogCharacters(account);
        return account;
    }

    private void EnsureCatalogCharacters(StoredAccount account)
    {
        lock (account.Sync)
        {
            var seededAccount = CreateSeededAccount(account.State.AccountId);
            var characters = new Dictionary<string, CharacterState>(account.State.Characters, StringComparer.Ordinal);
            var sigilInventory = new Dictionary<string, SigilInstance>(account.State.SigilInventory, StringComparer.Ordinal);
            var changed = false;
            foreach (var characterDefinition in AccountCatalog.CharacterDefinitions)
            {
                if (characters.ContainsKey(characterDefinition.CharacterId))
                {
                    continue;
                }

                if (seededAccount.Characters.TryGetValue(characterDefinition.CharacterId, out var seededCharacter))
                {
                    characters[characterDefinition.CharacterId] = seededCharacter;
                    changed = true;
                }
            }

            foreach (var (instanceId, sigil) in seededAccount.SigilInventory)
            {
                if (sigilInventory.ContainsKey(instanceId))
                {
                    continue;
                }

                sigilInventory[instanceId] = sigil;
                changed = true;
            }

            if (!changed)
            {
                return;
            }

            var nextActiveCharacterId = account.State.ActiveCharacterId;
            if (string.IsNullOrWhiteSpace(nextActiveCharacterId) || !characters.ContainsKey(nextActiveCharacterId))
            {
                nextActiveCharacterId = AccountCatalog.CharacterDefinitions[0].CharacterId;
            }

            account.State = account.State with
            {
                ActiveCharacterId = nextActiveCharacterId,
                Version = account.State.Version + 1,
                Characters = characters,
                SigilInventory = sigilInventory
            };
            PersistAccount(account);
        }
    }

    private static AccountState CreateSeededAccount(string accountId)
    {
        var miraiId = ArenaConfig.CharacterIds.Mirai;
        var sylwenId = ArenaConfig.CharacterIds.Sylwen;
        var velvetId = ArenaConfig.CharacterIds.Velvet;

        var mirai = new CharacterState(
            CharacterId: miraiId,
            Name: ArenaConfig.DisplayNames[miraiId],
            MasteryLevel: 6,
            MasteryXp: 1840,
            Inventory: new CharacterInventory(
                MaterialStacks: new Dictionary<string, long>(StringComparer.Ordinal),
                EquipmentInstances: new Dictionary<string, OwnedEquipmentInstance>(StringComparer.Ordinal)),
            Equipment: new EquipmentState(
                WeaponInstanceId: null),
            BestiaryKillsBySpecies: new Dictionary<string, int>(StringComparer.Ordinal),
            PrimalCoreBySpecies: new Dictionary<string, int>(StringComparer.Ordinal),
            UnlockedSigilSlots: ArenaConfig.MasteryConfig.InitialUnlockedSigilSlots);

        var sylwen = new CharacterState(
            CharacterId: sylwenId,
            Name: ArenaConfig.DisplayNames[sylwenId],
            MasteryLevel: 1,
            MasteryXp: 0,
            Inventory: new CharacterInventory(
                MaterialStacks: new Dictionary<string, long>(StringComparer.Ordinal),
                EquipmentInstances: new Dictionary<string, OwnedEquipmentInstance>(StringComparer.Ordinal)),
            Equipment: new EquipmentState(
                WeaponInstanceId: null),
            BestiaryKillsBySpecies: new Dictionary<string, int>(StringComparer.Ordinal),
            PrimalCoreBySpecies: new Dictionary<string, int>(StringComparer.Ordinal),
            UnlockedSigilSlots: ArenaConfig.MasteryConfig.InitialUnlockedSigilSlots);

        var velvet = new CharacterState(
            CharacterId: velvetId,
            Name: ArenaConfig.DisplayNames[velvetId],
            MasteryLevel: 1,
            MasteryXp: 0,
            Inventory: new CharacterInventory(
                MaterialStacks: new Dictionary<string, long>(StringComparer.Ordinal),
                EquipmentInstances: new Dictionary<string, OwnedEquipmentInstance>(StringComparer.Ordinal)),
            Equipment: new EquipmentState(
                WeaponInstanceId: null),
            BestiaryKillsBySpecies: new Dictionary<string, int>(StringComparer.Ordinal),
            PrimalCoreBySpecies: new Dictionary<string, int>(StringComparer.Ordinal),
            UnlockedSigilSlots: ArenaConfig.MasteryConfig.InitialUnlockedSigilSlots);

        var startsWithRefineReadyResources =
            accountId.Contains("refine_ready", StringComparison.Ordinal) ||
            accountId.Contains("refine_legendary_cap", StringComparison.Ordinal);
        if (startsWithRefineReadyResources)
        {
            var equipmentInstances = new Dictionary<string, OwnedEquipmentInstance>(mirai.Inventory.EquipmentInstances, StringComparer.Ordinal);
            if (accountId.Contains("refine_ready", StringComparison.Ordinal))
            {
                var refineCommonInstanceId = $"{accountId}.{miraiId}.crafted_refine_common";
                equipmentInstances[refineCommonInstanceId] = new OwnedEquipmentInstance(
                    InstanceId: refineCommonInstanceId,
                    DefinitionId: "wpn.primal_forged_blade",
                    IsLocked: false,
                    OriginSpeciesId: ArenaConfig.SpeciesIds.MeleeBrute,
                    Slot: "weapon",
                    Rarity: "common");
            }

            if (accountId.Contains("refine_legendary_cap", StringComparison.Ordinal))
            {
                var refineLegendaryInstanceId = $"{accountId}.{miraiId}.crafted_refine_legendary";
                equipmentInstances[refineLegendaryInstanceId] = new OwnedEquipmentInstance(
                    InstanceId: refineLegendaryInstanceId,
                    DefinitionId: "wpn.primal_forged_blade",
                    IsLocked: false,
                    OriginSpeciesId: ArenaConfig.SpeciesIds.MeleeBrute,
                    Slot: "weapon",
                    Rarity: "legendary");
            }

            mirai = mirai with
            {
                Inventory = mirai.Inventory with
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
                [ArenaConfig.SpeciesIds.MeleeBrute] = initialSpeciesProgress
            }
            : new Dictionary<string, int>(StringComparer.Ordinal);
        var initialPrimalCoreBySpecies = startsWithAnyCraftingResources
            ? new Dictionary<string, int>(StringComparer.Ordinal)
            {
                [ArenaConfig.SpeciesIds.MeleeBrute] = startsWithAscendantCapProgress
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
            ActiveCharacterId: miraiId,
            Version: 1,
            EchoFragmentsBalance: initialEchoFragments,
            KaerosBalance: 0L,
            AccountLevel: 1,
            AccountXp: 0L,
            Characters: new Dictionary<string, CharacterState>(StringComparer.Ordinal)
            {
                [miraiId] = mirai with
                {
                    BestiaryKillsBySpecies = initialBestiaryBySpecies,
                    PrimalCoreBySpecies = initialPrimalCoreBySpecies
                },
                [sylwenId] = sylwen,
                [velvetId] = velvet
            })
        {
            SigilInventory = BuildSeedSigilInventory()
        };
    }

    private static AccountState CloneAccountState(AccountState state)
    {
        var characters = new SortedDictionary<string, CharacterState>(StringComparer.Ordinal);
        foreach (var (characterId, character) in state.Characters.OrderBy(entry => entry.Key, StringComparer.Ordinal))
        {
            characters[characterId] = CloneCharacterState(character);
        }

        var sigilInventory = new SortedDictionary<string, SigilInstance>(StringComparer.Ordinal);
        foreach (var (instanceId, sigil) in state.SigilInventory.OrderBy(entry => entry.Key, StringComparer.Ordinal))
        {
            sigilInventory[instanceId] = sigil;
        }

        DailyContractsState? clonedDailyContracts = null;
        if (state.DailyContracts is not null)
        {
            clonedDailyContracts = new DailyContractsState(
                AssignedDate: state.DailyContracts.AssignedDate,
                Contracts: state.DailyContracts.Contracts
                    .Select(contract => contract with { })
                    .ToList());
        }

        return state with
        {
            Characters = characters,
            SigilInventory = sigilInventory,
            DailyContracts = clonedDailyContracts
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

        var ascendantSigilSlotsUnlocked = new SortedDictionary<int, bool>();
        foreach (var (tierIndex, isUnlocked) in character.AscendantSigilSlotsUnlocked.OrderBy(entry => entry.Key))
        {
            ascendantSigilSlotsUnlocked[tierIndex] = isUnlocked;
        }

        return character with
        {
            Inventory = new CharacterInventory(
                MaterialStacks: materialStacks,
                EquipmentInstances: equipmentInstances),
            BestiaryKillsBySpecies = bestiaryKillsBySpecies,
            PrimalCoreBySpecies = primalCoreBySpecies,
            AscendantSigilSlotsUnlocked = ascendantSigilSlotsUnlocked
        };
    }

    private sealed class StoredAccount
    {
        public StoredAccount(
            AccountState state,
            Dictionary<string, Dictionary<string, IReadOnlyList<DropEvent>>> awardedBySourceKeyByCharacter)
        {
            State = state;
            AwardedBySourceKeyByCharacter = awardedBySourceKeyByCharacter;
        }

        public object Sync { get; } = new();

        public AccountState State { get; set; }

        public Dictionary<string, Dictionary<string, IReadOnlyList<DropEvent>>> AwardedBySourceKeyByCharacter { get; }
    }

    private sealed class NullAccountStatePersistence : IAccountStatePersistence
    {
        public static NullAccountStatePersistence Instance { get; } = new();

        public IReadOnlyDictionary<string, PersistedAccountData> LoadAll()
        {
            return new Dictionary<string, PersistedAccountData>(StringComparer.Ordinal);
        }

        public void Save(PersistedAccountData persistedAccount)
        {
            _ = persistedAccount;
        }
    }

    private readonly record struct RefineRule(
        string FromRarity,
        string ToRarity,
        int PrimalCoreCost,
        int EchoFragmentsCost);

    private readonly record struct MilestoneRewardDelta(
        long KaerosAward,
        long EchoFragmentsAward);
}
