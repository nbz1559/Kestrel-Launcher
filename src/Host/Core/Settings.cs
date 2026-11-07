using System.IO;
using System.Text.Json;

namespace Host.Core;

/// <summary>Launcher settings and metadata. Saved to KestrelLauncher\settings.json.</summary>
public class Settings
{
    public int SchemaVersion { get; set; } = 1;   // lets later versions migrate old files
    public bool AutoUpdate { get; set; } = true;
    public bool CloseOnLaunch { get; set; } = false;
    public string? GamePath { get; set; }

    public static Settings Load()
    {
        try
        {
            if (File.Exists(AppPaths.SettingsFile))
                return JsonSerializer.Deserialize<Settings>(File.ReadAllText(AppPaths.SettingsFile), Json.Options)
                       ?? new Settings();
        }
        catch (Exception ex) when (ex is JsonException or IOException or UnauthorizedAccessException)
        {
            // Unreadable file: keep it for inspection and start from defaults
            try { File.Move(AppPaths.SettingsFile, AppPaths.SettingsFile + ".bad", overwrite: true); } catch { }
        }
        return new Settings();
    }

    public void Save()
    {
        Directory.CreateDirectory(AppPaths.LauncherDir);
        // Write to a temp file first, so a crash mid-save can't leave a half-written settings.json
        var temp = AppPaths.SettingsFile + ".tmp";
        File.WriteAllText(temp, JsonSerializer.Serialize(this, Json.Pretty));
        File.Move(temp, AppPaths.SettingsFile, overwrite: true);
    }
}