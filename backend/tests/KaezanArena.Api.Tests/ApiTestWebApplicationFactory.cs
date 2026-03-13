using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.Configuration;

namespace KaezanArena.Api.Tests;

public sealed class ApiTestWebApplicationFactory : WebApplicationFactory<Program>
{
    private readonly string _accountStateStoragePath =
        Path.Combine(Path.GetTempPath(), "kaezan-arena-tests", Guid.NewGuid().ToString("N"), "accounts");

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.ConfigureAppConfiguration((_, configurationBuilder) =>
        {
            configurationBuilder.AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["AccountState:StorageDirectory"] = _accountStateStoragePath
            });
        });
    }

    protected override void Dispose(bool disposing)
    {
        base.Dispose(disposing);
        if (!disposing)
        {
            return;
        }

        var rootDirectory = Directory.GetParent(_accountStateStoragePath)?.FullName;
        if (string.IsNullOrWhiteSpace(rootDirectory) || !Directory.Exists(rootDirectory))
        {
            return;
        }

        try
        {
            Directory.Delete(rootDirectory, recursive: true);
        }
        catch
        {
            // Best effort cleanup for test-only temporary storage.
        }
    }
}
