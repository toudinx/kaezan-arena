using KaezanArena.Api.Contracts.Health;
using Microsoft.AspNetCore.Mvc;

namespace KaezanArena.Api.Controllers;

[ApiController]
[Route("health")]
public sealed class HealthController : ControllerBase
{
    [HttpGet]
    public ActionResult<HealthResponseDto> Get()
    {
        return Ok(new HealthResponseDto("ok"));
    }
}

