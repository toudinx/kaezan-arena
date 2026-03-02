using System.Diagnostics;
using KaezanArena.Api.Contracts.Common;

namespace KaezanArena.Api.Middleware;

public sealed class GlobalExceptionHandlingMiddleware
{
    private readonly RequestDelegate _next;
    private readonly ILogger<GlobalExceptionHandlingMiddleware> _logger;

    public GlobalExceptionHandlingMiddleware(
        RequestDelegate next,
        ILogger<GlobalExceptionHandlingMiddleware> logger)
    {
        _next = next;
        _logger = logger;
    }

    public async Task InvokeAsync(HttpContext context)
    {
        try
        {
            await _next(context);
        }
        catch (Exception exception)
        {
            var traceId = Activity.Current?.Id ?? context.TraceIdentifier;
            _logger.LogError(
                exception,
                "Unhandled exception for {Method} {Path} with trace {TraceId}.",
                context.Request.Method,
                context.Request.Path,
                traceId);

            context.Response.StatusCode = StatusCodes.Status500InternalServerError;
            context.Response.ContentType = "application/json";

            var response = new ApiErrorDto(
                Code: "internal_error",
                Message: "An unexpected error occurred.",
                TraceId: traceId);

            await context.Response.WriteAsJsonAsync(response);
        }
    }
}

