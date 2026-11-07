using System.IO;

namespace Host.Core;

/// <summary>Every folder and file the launcher uses, in one place.</summary>
static class AppPaths
{
    // %AppData%\Kestrel
    public static readonly string Root = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "Kestrel");

    // %AppData%\Kestrel\KestrelLauncher\settings.json
    public static readonly string LauncherDir = Path.Combine(Root, "KestrelLauncher");
    public static readonly string SettingsFile = Path.Combine(LauncherDir, "settings.json");

    // %AppData%\Kestrel\KestrelGTALegacy, one folder per mod, named by its id
    public static string ModDir(string modId) => Path.Combine(Root, modId);
}