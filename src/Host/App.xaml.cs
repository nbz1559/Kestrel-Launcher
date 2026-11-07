using System.Windows;
using Velopack;

namespace Host;

public partial class App : Application
{
    [STAThread]
    private static void Main(string[] args)
    {
        // Must run first. Velopack uses it to handle install, update, and uninstall events,
        // and it may exit or restart the process before anything below runs.
        VelopackApp.Build().Run();

        App app = new();
        app.InitializeComponent();   // applies App.xaml (this is what opens MainWindow)
        app.Run();
    }
}