using System.Text.RegularExpressions;
using KaezanArena.Api.Contracts.Common;
using KaezanArena.Api.Contracts.Effects;
using KaezanArena.Application.Effects;
using Microsoft.AspNetCore.Mvc;

namespace KaezanArena.Api.Controllers;

[ApiController]
[Route("api/v1/effects")]
public sealed partial class EffectsV1Controller : ControllerBase
{
    private readonly ITileAoeFxPlanner _planner;

    public EffectsV1Controller(ITileAoeFxPlanner planner)
    {
        _planner = planner;
    }

    [HttpPost("aoe-plan")]
    public ActionResult<AoePlanResponseDto> PlanAoe([FromBody] AoePlanRequestDto request)
    {
        var validationError = ValidateRequest(request);
        if (validationError is not null)
        {
            return BadRequest(new ApiErrorDto(
                Code: "validation_error",
                Message: validationError,
                TraceId: HttpContext.TraceIdentifier));
        }

        var spawns = _planner
            .Plan(new AoePlanRequest(
                CenterX: request.Center.X,
                CenterY: request.Center.Y,
                Radius: request.Radius,
                Shape: request.Shape,
                FxId: request.FxId))
            .Select(spawn => new AoePlanSpawnDto(
                TileX: spawn.TileX,
                TileY: spawn.TileY,
                FxId: spawn.FxId))
            .ToList();

        return Ok(new AoePlanResponseDto(spawns));
    }

    private static string? ValidateRequest(AoePlanRequestDto request)
    {
        if (request.Center is null)
        {
            return "center is required";
        }

        if (request.Radius < 0)
        {
            return "radius must be >= 0";
        }

        if (!string.Equals(request.Shape, "square", StringComparison.OrdinalIgnoreCase))
        {
            return "shape must be 'square'";
        }

        if (string.IsNullOrWhiteSpace(request.FxId))
        {
            return "fxId is required";
        }

        if (!FxIdPattern().IsMatch(request.FxId))
        {
            return "fxId must be dot-separated tokens without spaces or slashes";
        }

        return null;
    }

    [GeneratedRegex("^[A-Za-z0-9_-]+(?:\\.[A-Za-z0-9_-]+)+$")]
    private static partial Regex FxIdPattern();
}
