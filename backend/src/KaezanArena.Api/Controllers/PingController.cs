using Microsoft.AspNetCore.Mvc;

namespace KaezanArena.Api.Controllers;

[ApiController]
[Route("api/ping")]
public sealed class PingController : ControllerBase
{
    [HttpGet]
    public ActionResult<object> Get()
    {
        return Ok(new
        {
            pong = true
        });
    }
}
