using System.Text.Json;

namespace Host.Core;

static class Json
{
    // camelCase, so C# properties like AutoUpdate arrive in JavaScript as autoUpdate
    public static readonly JsonSerializerOptions Options = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
    };

    public static readonly JsonSerializerOptions Pretty = new(Options) { WriteIndented = true };
}