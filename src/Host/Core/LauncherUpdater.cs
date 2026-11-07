using Velopack;
using Velopack.Sources;

namespace Host.Core;

/// <summary>
/// Updates the launcher itself (not the mods) from GitHub Releases.
/// It checks and downloads in the background, then waits for the user to restart.
/// </summary>
class LauncherUpdater
{
    const string RepoUrl = "https://github.com/nbz1559/Kestrel-Releases";

    readonly UpdateManager _manager = new(new GithubSource(RepoUrl, string.Empty, false));
    UpdateInfo? _pending;   // downloaded and waiting to be applied
    bool _busy;

    /// <summary>Raised with a ready-to-send message. May fire on a background thread.</summary>
    public event Action<object>? Status;

    /// <summary>The most recent status, so the page can catch up if it loaded late.</summary>
    public object? Last { get; private set; }

    void Report(string status, string? version = null, int percent = 0)
    {
        Last = new { type = "launcherUpdate", status, version, percent };
        Status?.Invoke(Last);
    }

    public async Task CheckAsync(bool manual)
    {
        if (_busy || _pending != null) return;

        // Running from Visual Studio (not an installed copy): nothing to update
        if (!_manager.IsInstalled)
        {
            if (manual) Report("devbuild");
            return;
        }

        _busy = true;
        try
        {
            if (manual) Report("checking");
            var update = await _manager.CheckForUpdatesAsync();
            if (update == null)
            {
                if (manual) Report("none");
                return;
            }

            var version = update.TargetFullRelease.Version.ToString();
            Report("downloading", version, 0);
            await _manager.DownloadUpdatesAsync(update, percent => Report("downloading", version, percent));

            _pending = update;
            Report("ready", version);
        }
        catch
        {
            // No internet, or GitHub is down. Stay quiet on startup, tell the user if they asked.
            if (manual) Report("error");
        }
        finally { _busy = false; }
    }

    /// <summary>The user clicked Restart to update.</summary>
    public void RestartToUpdate()
    {
        if (_pending != null) _manager.ApplyUpdatesAndRestart(_pending);
    }

    /// <summary>If the user never clicked Restart, apply the update when they close the launcher.</summary>
    public void ApplyOnExit()
    {
        if (_pending != null) _manager.WaitExitThenApplyUpdates(_pending.TargetFullRelease, restart: false);
    }
}