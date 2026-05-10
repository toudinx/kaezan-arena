using System.Text.Json;
using KaezanArena.Api.Analytics;
using Microsoft.AspNetCore.Mvc;

namespace KaezanArena.Api.Controllers;

[ApiController]
[Route("api/v1/analytics")]
public sealed class AnalyticsV1Controller : ControllerBase
{
    private readonly RunResultStore _store;

    public AnalyticsV1Controller(RunResultStore store) => _store = store;

    [HttpPost("run-result")]
    public async Task<IActionResult> PostRunResult([FromBody] JsonElement body)
    {
        await _store.AppendAsync(body);
        return NoContent();
    }
}
