namespace KaezanArena.Api.Account;

public interface IAccountStateStore
{
    AccountState GetAccountState(string accountId);

    AccountState SetActiveCharacter(string accountId, string characterId);

    CharacterState EquipItem(string accountId, string characterId, EquipmentSlot slot, string equipmentInstanceId);

    CharacterState EquipWeapon(string accountId, string characterId, string weaponInstanceId);

    AwardDropsResult AwardDrops(string accountId, string characterId, string battleId, IReadOnlyList<DropSource> sources, int? battleSeed = null);

    BestiaryCraftResult CraftBestiaryItem(string accountId, string speciesId, EquipmentSlot slot);

    ItemRefineResult RefineItem(string accountId, string itemInstanceId);

    ItemSalvageResult SalvageItem(string accountId, string itemInstanceId);
}
