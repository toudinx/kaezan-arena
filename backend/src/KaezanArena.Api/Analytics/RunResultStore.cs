using System.Text.Json;

namespace KaezanArena.Api.Analytics;

public sealed class RunResultStore
{
    private readonly string _dataDirectory;
    private readonly SemaphoreSlim _lock = new(1, 1);

    public RunResultStore(IWebHostEnvironment env, IConfiguration config)
    {
        var dir = config["Analytics:StorageDirectory"]
            ?? Path.Combine(env.ContentRootPath, ".data", "analytics");
        Directory.CreateDirectory(dir);
        _dataDirectory = dir;
    }

    public async Task AppendAsync(JsonElement entry)
    {
        var filePath = Path.Combine(
            _dataDirectory,
            $"run-results-{DateTimeOffset.UtcNow:yyyyMMdd}.jsonl");
        var line = JsonSerializer.Serialize(entry) + "\n";
        await _lock.WaitAsync();
        try
        {
            await File.AppendAllTextAsync(filePath, line);
        }
        finally
        {
            _lock.Release();
        }
    }
}
