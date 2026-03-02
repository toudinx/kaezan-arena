namespace KaezanArena.Api.Contracts.Common;

public sealed record ApiErrorDto(
    string Code,
    string Message,
    string TraceId);

