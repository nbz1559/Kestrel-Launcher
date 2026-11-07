using System.IO;
using System.Text.Json;
using System.Windows;
using Host.Core;
using Microsoft.Web.WebView2.Core;
using Microsoft.Win32;

namespace Host;

public partial class MainWindow : Window
{
    readonly Settings _settings = Settings.Load();
    readonly LauncherUpdater _updater = new();

    public MainWindow()
    {
        InitializeComponent();
        // Updater callbacks can arrive on a background thread, so hop to the UI thread before using the page
        _updater.Status += message => Dispatcher.InvokeAsync(() => Send(message));
        Loaded += async (_, _) => { await InitWebAsync(); _ = _updater.CheckAsync(manual: false); };
        StateChanged += OnStateChanged;
    }

    async Task InitWebAsync()
    {
        // The browser cache stays in LocalAppData (it is disposable and shouldn't roam)
        var dataDir = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "Kestrel", "WebView2");

        var env = await CoreWebView2Environment.CreateAsync(userDataFolder: dataDir);
        await Web.EnsureCoreWebView2Async(env);

        Web.CoreWebView2.Settings.IsNonClientRegionSupportEnabled = true;
        Web.CoreWebView2.SetVirtualHostNameToFolderMapping(
            "app.local",
            Path.Combine(AppContext.BaseDirectory, "UI"),
            CoreWebView2HostResourceAccessKind.Allow);

        Web.CoreWebView2.WebMessageReceived += OnMessage;
        Web.CoreWebView2.Navigate("https://app.local/index.html");
    }

    // ---------- Messages from the UI ----------

    void OnMessage(object? sender, CoreWebView2WebMessageReceivedEventArgs e)
    {
        try
        {
            using var doc = JsonDocument.Parse(e.WebMessageAsJson);
            Handle(doc.RootElement);
        }
        catch (Exception ex) when (ex is JsonException or KeyNotFoundException or InvalidOperationException)
        {
            // Malformed message from the page: ignore it rather than crash the launcher
        }
    }

    void Handle(JsonElement msg)
    {
        switch (msg.GetProperty("type").GetString())
        {
            case "getState": SendState(); break;
            case "setSetting": SetSetting(msg); break;
            case "browseGameFolder": BrowseGameFolder(); break;
            case "checkLauncherUpdate": _ = _updater.CheckAsync(manual: true); break;
            case "restartToUpdate": _updater.RestartToUpdate(); break;
            case "window": HandleWindow(msg.GetProperty("action").GetString()); break;

            // Not built yet: end the progress bar and say so, instead of leaving the card stuck
            case "action":
                Send(new { type = "busyEnd", mod = msg.GetProperty("mod").GetString() });
                SendError("Install, update, and launch aren’t built yet.");
                break;
            case "verify": SendError("Verify files isn’t built yet."); break;
        }
    }

    void SetSetting(JsonElement msg)
    {
        var value = msg.GetProperty("value");
        var isBool = value.ValueKind is JsonValueKind.True or JsonValueKind.False;

        switch (msg.GetProperty("key").GetString())
        {
            case "autoUpdate" when isBool: _settings.AutoUpdate = value.GetBoolean(); break;
            case "closeOnLaunch" when isBool: _settings.CloseOnLaunch = value.GetBoolean(); break;
            default: return;   // unknown key or wrong type: ignore (the game path is only set via Browse)
        }
        SaveSettings();
    }

    void BrowseGameFolder()
    {
        var dialog = new OpenFolderDialog { Title = "Select your Grand Theft Auto V folder" };
        if (!string.IsNullOrEmpty(_settings.GamePath) && Directory.Exists(_settings.GamePath))
            dialog.InitialDirectory = _settings.GamePath;

        if (dialog.ShowDialog(this) != true) return;

        if (!File.Exists(Path.Combine(dialog.FolderName, "GTA5.exe")))
        {
            SendError("That folder doesn’t contain GTA5.exe.");
            return;
        }
        _settings.GamePath = dialog.FolderName;
        if (SaveSettings()) SendState();
    }

    bool SaveSettings()
    {
        try { _settings.Save(); return true; }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
        {
            SendError("Couldn’t save settings: " + ex.Message);
            return false;
        }
    }

    void HandleWindow(string? action)
    {
        switch (action)
        {
            case "minimize": WindowState = WindowState.Minimized; break;
            case "maximize":
                WindowState = WindowState == WindowState.Maximized ? WindowState.Normal : WindowState.Maximized;
                break;
            case "close": Close(); break;
        }
    }

    // ---------- Messages to the UI ----------

    void SendState() => Send(new
    {
        type = "state",
        launcherVersion = typeof(MainWindow).Assembly.GetName().Version?.ToString(3),
        server = "online",                                   // real check comes later
        update = _updater.Last,
        game = new { running = false, injected = Array.Empty<string>() },
        settings = _settings,
        // Placeholder until the mod catalog exists
        mods = new[]
        {
            new
            {
                id = "KestrelGTALegacy",
                name = "Kestrel",
                description = "Placeholder description. Replace this with what the mod adds to the game.",
                latestVersion = "0.1.0",
                installedVersion = (string?)null,
                uploaded = "2026-11-07",
                size = 48234496L,
            },
        },
    });

    void SendError(string message) => Send(new { type = "error", message });

    void OnStateChanged(object? sender, EventArgs e)
    {
        // A chromeless maximized window overflows the screen edges, so pad it back in
        Padding = WindowState == WindowState.Maximized
            ? SystemParameters.WindowResizeBorderThickness
            : new Thickness(0);

        Send(new { type = "windowState", maximized = WindowState == WindowState.Maximized });
    }

    protected override void OnClosed(EventArgs e)
    {
        _updater.ApplyOnExit();   // installs a downloaded update if the user didn't restart for it
        base.OnClosed(e);
    }

    void Send(object message) =>
        Web.CoreWebView2?.PostWebMessageAsJson(JsonSerializer.Serialize(message, Json.Options));
}