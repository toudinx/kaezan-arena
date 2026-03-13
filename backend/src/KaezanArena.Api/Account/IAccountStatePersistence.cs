namespace KaezanArena.Api.Account;

public interface IAccountStatePersistence
{
    IReadOnlyDictionary<string, PersistedAccountData> LoadAll();

    void Save(PersistedAccountData persistedAccount);
}

public sealed record PersistedAccountData(
    AccountState State,
    Dictionary<string, Dictionary<string, List<DropEvent>>> AwardedBySourceKeyByCharacter);
