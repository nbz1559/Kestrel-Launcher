using System.IO;
using System.Windows;
using Microsoft.Web.WebView2.Core;

namespace Host;

public partial class MainWindow : Window
{
    public MainWindow()
    {
        InitializeComponent();
        Loaded += async (_, _) => await InitWebAsync();
    }

    async Task InitWebAsync()
    {
        var dataDir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Kestrel", "WebView2");

        var env = await CoreWebView2Environment.CreateAsync(userDataFolder: dataDir);
        await Web.EnsureCoreWebView2Async(env);

        Web.CoreWebView2.SetVirtualHostNameToFolderMapping("app.local", Path.Combine(AppContext.BaseDirectory, "UI"), CoreWebView2HostResourceAccessKind.Allow);

        Web.CoreWebView2.WebMessageReceived += OnMessage;
        Web.CoreWebView2.Navigate("https://app.local/index.html");
    }

    void OnMessage(object? sender, CoreWebView2WebMessageReceivedEventArgs e)
    {
        if (e.TryGetWebMessageAsString() == "ping")
            Web.CoreWebView2.PostWebMessageAsString("pong from C#");
    }
}