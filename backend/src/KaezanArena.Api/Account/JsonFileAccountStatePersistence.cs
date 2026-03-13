using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

namespace KaezanArena.Api.Account;

public sealed class JsonFileAccountStatePersistence : IAccountStatePersistence
{
    private readonly string _storageDirectoryPath;
    private readonly object _sync = new();
    private readonly JsonSerializerOptions _jsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        WriteIndented = true
    };

    public JsonFileAccountStatePersistence(string storageDirectoryPath)
    {
        if (string.IsNullOrWhiteSpace(storageDirectoryPath))
        {
            throw new ArgumentException("Storage directory path is required.", nameof(storageDirectoryPath));
        }

        _storageDirectoryPath = Path.GetFullPath(storageDirectoryPath.Trim());
    }

    public IReadOnlyDictionary<string, PersistedAccountData> LoadAll()
    {
        if (!Directory.Exists(_storageDirectoryPath))
        {
            return new Dictionary<string, PersistedAccountData>(StringComparer.Ordinal);
        }

        var loadedByAccountId = new Dictionary<string, PersistedAccountData>(StringComparer.Ordinal);
        foreach (var path in Directory.EnumerateFiles(_storageDirectoryPath, "*.json", SearchOption.TopDirectoryOnly))
        {
            PersistedAccountData? loaded;
            try
            {
                var json = File.ReadAllText(path);
                loaded = JsonSerializer.Deserialize<PersistedAccountData>(json, _jsonOptions);
            }
            catch
            {
                continue;
            }

            if (loaded?.State is null ||
                string.IsNullOrWhiteSpace(loaded.State.AccountId) ||
                loaded.State.Characters is null)
            {
                continue;
            }

            var normalizedAccountId = NormalizeAccountId(loaded.State.AccountId);
            loadedByAccountId[normalizedAccountId] = NormalizePersistedAccountData(loaded, normalizedAccountId);
        }

        return loadedByAccountId;
    }

    public void Save(PersistedAccountData persistedAccount)
    {
        if (persistedAccount?.State is null)
        {
            throw new ArgumentException("Persisted account state is required.", nameof(persistedAccount));
        }

        var normalizedAccountId = NormalizeAccountId(persistedAccount.State.AccountId);
        var normalized = NormalizePersistedAccountData(persistedAccount, normalizedAccountId);
        var targetPath = ResolveAccountFilePath(normalizedAccountId);
        var tempPath = $"{targetPath}.tmp";
        var json = JsonSerializer.Serialize(normalized, _jsonOptions);

        lock (_sync)
        {
            Directory.CreateDirectory(_storageDirectoryPath);
            File.WriteAllText(tempPath, json, Encoding.UTF8);
            File.Move(tempPath, targetPath, overwrite: true);
        }
    }

    private PersistedAccountData NormalizePersistedAccountData(PersistedAccountData source, string normalizedAccountId)
    {
        var state = source.State with
        {
            AccountId = normalizedAccountId
        };
        var awardedByCharacter = new Dictionary<string, Dictionary<string, List<DropEvent>>>(StringComparer.Ordinal);
        var sourceAwardedByCharacter = source.AwardedBySourceKeyByCharacter ??
            new Dictionary<string, Dictionary<string, List<DropEvent>>>(StringComparer.Ordinal);
        foreach (var (characterId, awardedBySource) in sourceAwardedByCharacter)
        {
            var normalizedCharacterId = characterId?.Trim();
            if (string.IsNullOrWhiteSpace(normalizedCharacterId))
            {
                continue;
            }

            var normalizedAwardedBySource =
                new Dictionary<string, List<DropEvent>>(StringComparer.Ordinal);
            foreach (var (sourceKey, events) in awardedBySource ?? new Dictionary<string, List<DropEvent>>(StringComparer.Ordinal))
            {
                if (string.IsNullOrWhiteSpace(sourceKey))
                {
                    continue;
                }

                normalizedAwardedBySource[sourceKey] = events?.ToList() ?? [];
            }

            awardedByCharacter[normalizedCharacterId] = normalizedAwardedBySource;
        }

        return new PersistedAccountData(
            State: state,
            AwardedBySourceKeyByCharacter: awardedByCharacter);
    }

    private string ResolveAccountFilePath(string accountId)
    {
        var safeAccountSegment = SanitizeFileSegment(accountId);
        var hashSegment = ComputeStableHashSegment(accountId);
        var fileName = $"{safeAccountSegment}.{hashSegment}.json";
        return Path.Combine(_storageDirectoryPath, fileName);
    }

    private static string NormalizeAccountId(string? accountId)
    {
        return string.IsNullOrWhiteSpace(accountId) ? "dev_account" : accountId.Trim();
    }

    private static string SanitizeFileSegment(string accountId)
    {
        var invalidFileNameChars = Path.GetInvalidFileNameChars();
        var builder = new StringBuilder(accountId.Length);
        foreach (var character in accountId)
        {
            builder.Append(Array.IndexOf(invalidFileNameChars, character) >= 0 ? '_' : character);
        }

        if (builder.Length == 0)
        {
            builder.Append("account");
        }

        return builder.ToString();
    }

    private static string ComputeStableHashSegment(string accountId)
    {
        var hash = SHA256.HashData(Encoding.UTF8.GetBytes(accountId));
        return Convert.ToHexString(hash).ToLowerInvariant()[..12];
    }
}
