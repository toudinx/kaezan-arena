namespace KaezanArena.Api.Contracts.Account;

public sealed record AccountStateDto(
    string AccountId,
    string ActiveCharacterId,
    int Version,
    long EchoFragmentsBalance,
    long KaerosBalance,
    int AccountLevel,
    long AccountXp,
    int AccountXpForCurrentLevel,
    int AccountXpRequiredForNextLevel,
    int UnlockedZoneCount,
    DailyContractsDto DailyContracts,
    IReadOnlyList<SigilInstanceDto> SigilInventory,
    IReadOnlyDictionary<string, CharacterStateDto> Characters);

public sealed record ContractDto(
    string ContractId,
    string Description,
    bool IsCompleted,
    int CurrentProgress,
    int TargetValue,
    int KaerosReward,
    string Type);

public sealed record DailyContractsDto(
    DateOnly AssignedDate,
    IReadOnlyList<ContractDto> Contracts);

public sealed record AscendantTierProgressDto(
    int TierIndex,
    string TierName,
    bool IsUnlocked,
    int SpeciesAtMaxRank,
    int SpeciesRequired,
    IReadOnlyList<string> MissingSpecies);

public sealed record CharacterStateDto(
    string CharacterId,
    string Name,
    int MasteryLevel,
    long MasteryXp,
    int MasteryXpForCurrentLevel,
    int MasteryXpRequiredForNextLevel,
    int UnlockedSigilSlots,
    CharacterSigilLoadoutDto SigilLoadout,
    CharacterInventoryDto Inventory,
    CharacterEquipmentDto Equipment,
    IReadOnlyDictionary<string, int> BestiaryKillsBySpecies,
    IReadOnlyDictionary<string, int> PrimalCoreBySpecies,
    IReadOnlyList<AscendantTierProgressDto> AscendantProgress);

public sealed record SigilInstanceDto(
    string InstanceId,
    string DefinitionId,
    string SpeciesId,
    string SpeciesDisplayName,
    int SigilLevel,
    int SlotIndex,
    string TierId,
    string TierName,
    int HpBonus,
    bool IsLocked,
    bool RequiresAscendantUnlock);

public sealed record CharacterSigilLoadoutDto(
    SigilInstanceDto? Slot1,
    SigilInstanceDto? Slot2,
    SigilInstanceDto? Slot3,
    SigilInstanceDto? Slot4,
    SigilInstanceDto? Slot5);

public sealed record CharacterInventoryDto(
    IReadOnlyDictionary<string, long> MaterialStacks,
    IReadOnlyDictionary<string, OwnedEquipmentInstanceDto> EquipmentInstances);

public sealed record OwnedEquipmentInstanceDto(
    string InstanceId,
    string DefinitionId,
    bool IsLocked,
    string? OriginSpeciesId = null,
    string? Slot = null,
    string? Rarity = null,
    string? CraftedByCharacterId = null,
    string? CraftedByCharacterName = null);

public sealed record CharacterEquipmentDto(
    string? WeaponInstanceId);
