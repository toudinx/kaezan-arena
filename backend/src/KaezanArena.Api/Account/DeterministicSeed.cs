using System.Security.Cryptography;
using System.Text;

namespace KaezanArena.Api.Account;

internal static class DeterministicSeed
{
    public static int FromParts(params string[] parts)
    {
        var joined = string.Join("|", parts.Select(part => part ?? string.Empty));
        var bytes = SHA256.HashData(Encoding.UTF8.GetBytes(joined));
        return BitConverter.ToInt32(bytes, 0);
    }

    public static string HashId(string prefix, params string[] parts)
    {
        var joined = string.Join("|", parts.Select(part => part ?? string.Empty));
        var bytes = SHA256.HashData(Encoding.UTF8.GetBytes(joined));
        var shortHash = Convert.ToHexString(bytes.AsSpan(0, 8)).ToLowerInvariant();
        return $"{prefix}_{shortHash}";
    }
}