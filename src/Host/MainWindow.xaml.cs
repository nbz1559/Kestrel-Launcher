using System.IO;
using System.Text.Json;
using System.Windows;
using Microsoft.Web.WebView2.Core;

namespace Host;

public partial class MainWindow : Window
{
    public MainWindow()
    {
        InitializeComponent();
        Loaded += async (_, _) => await InitWebAsync();
        StateChanged += OnStateChanged;
    }

    async Task InitWebAsync()
    {
        var dataDir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Kestrel", "WebView2");

        var env = await CoreWebView2Environment.CreateAsync(userDataFolder: dataDir);
        await Web.EnsureCoreWebView2Async(env);

        Web.CoreWebView2.Settings.IsNonClientRegionSupportEnabled = true;

        Web.CoreWebView2.SetVirtualHostNameToFolderMapping("app.local", Path.Combine(AppContext.BaseDirectory, "UI"), CoreWebView2HostResourceAccessKind.Allow);

        Web.CoreWebView2.WebMessageReceived += OnMessage;
        Web.CoreWebView2.Navigate("https://app.local/index.html");
    }

    void OnMessage(object? sender, CoreWebView2WebMessageReceivedEventArgs e)
    {
        using var doc = JsonDocument.Parse(e.WebMessageAsJson);
        var root = doc.RootElement;
        if (root.ValueKind != JsonValueKind.Object) return;

        switch (root.GetProperty("type").GetString())
        {
            case "ping":
                Send(new { type = "pong", text = "pong from C#" });
                break;

            case "window":
                switch (root.GetProperty("action").GetString())
                {
                    case "minimize": WindowState = WindowState.Minimized; break;
                    case "maximize":
                        WindowState = WindowState == WindowState.Maximized
                            ? WindowState.Normal : WindowState.Maximized;
                        break;
                    case "close": Close(); break;
                }
                break;
        }
    }

    void OnStateChanged(object? sender, EventArgs e)
    {
        Padding = WindowState == WindowState.Maximized ? SystemParameters.WindowResizeBorderThickness : new Thickness(0);

        Send(new { type = "windowState", maximized = WindowState == WindowState.Maximized });
    }

    void Send(object message) => Web.CoreWebView2?.PostWebMessageAsJson(JsonSerializer.Serialize(message));
}