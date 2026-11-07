// The only file that talks to the C# host.
//
// While MOCK is true, a fake host answers instead, so you can design the UI in a normal
// browser with no C# running. Set MOCK = false once the real C# logic sends these messages.
//
// UI -> host:  getState | action {mod, action} | setSetting {key, value} | browseGameFolder | verify
//              | checkLauncherUpdate | restartToUpdate | window {action}
// host -> UI:  state {...} | progress {mod, percent, label} | busyEnd {mod} | error {message} | windowState {maximized}
//              | launcherUpdate {status: checking|downloading|ready|none|error|devbuild, version, percent}
const MOCK = false;

const host = (() => {
  const handlers = {};
  const on = (type, fn) => (handlers[type] ??= []).push(fn);
  const emit = msg => (handlers[msg.type] ?? []).forEach(fn => fn(msg));
  const toNative = msg => window.chrome?.webview?.postMessage(msg);

  window.chrome?.webview?.addEventListener("message", e => emit(e.data));
  if (!MOCK) return { on, send: toNative, mock: false };

  // ---- Fake host ----
  const state = {
    launcherVersion: "0.1.0",
    server: "online",
    update: null,
    game: { running: false, injected: [] },
    settings: {
      autoUpdate: true,
      closeOnLaunch: false,
      gamePath: "C:\\Program Files (x86)\\Steam\\steamapps\\common\\Grand Theft Auto V",
    },
    mods: [{
      id: "kestrel",
      name: "Kestrel",
      description: "Placeholder description. Replace this with what the mod adds to the game.",
      latestVersion: "0.2.0",
      installedVersion: null,
      uploaded: "2026-11-07",
      size: 48234496,
    }],
  };
  const push = () => emit({ type: "state", ...structuredClone(state) });

  function fakeWork(modId, label, done) {
    let percent = 0;
    const timer = setInterval(() => {
      percent = Math.min(100, percent + 4 + Math.random() * 6);
      emit({ type: "progress", mod: modId, percent: Math.round(percent), label });
      if (percent >= 100) {
        clearInterval(timer);
        setTimeout(() => { emit({ type: "busyEnd", mod: modId }); done?.(); push(); }, 300);
      }
    }, 120);
  }

  const emitUpdate = msg => { state.update = msg; emit(msg); };
  function fakeLauncherUpdate() {
    emitUpdate({ type: "launcherUpdate", status: "checking" });
    setTimeout(() => {
      let percent = 0;
      const timer = setInterval(() => {
        percent = Math.min(100, percent + 10);
        emitUpdate({ type: "launcherUpdate", status: "downloading", version: "0.1.1", percent });
        if (percent >= 100) { clearInterval(timer); emitUpdate({ type: "launcherUpdate", status: "ready", version: "0.1.1" }); }
      }, 250);
    }, 800);
  }

  function send(msg) {
    if (msg.type === "window") return toNative(msg);   // title bar buttons still reach C#
    const mod = state.mods.find(m => m.id === msg.mod);
    switch (msg.type) {
      case "getState": push(); break;
      case "action":
        if (msg.action === "install") fakeWork(mod.id, "Downloading", () => { mod.installedVersion = mod.latestVersion; });
        if (msg.action === "update")  fakeWork(mod.id, "Updating", () => { mod.installedVersion = mod.latestVersion; });
        if (msg.action === "launch")  fakeWork(mod.id, "Starting game", () => { state.game.running = true; state.game.injected.push(mod.id); });
        if (msg.action === "inject")  fakeWork(mod.id, "Injecting", () => { state.game.injected.push(mod.id); });
        break;
      case "setSetting": state.settings[msg.key] = msg.value; push(); break;
      case "browseGameFolder": emit({ type: "error", message: "The folder picker is part of the real launcher." }); break;
      case "verify": fakeWork(state.mods[0].id, "Verifying files"); break;
      case "checkLauncherUpdate": fakeLauncherUpdate(); break;
      case "restartToUpdate": emit({ type: "error", message: "The real launcher would restart here." }); break;
    }
  }

  // Lets the on-screen mock controls put the fake data into any state
  const dev = {
    installed(version) { state.mods[0].installedVersion = version; push(); },
    running(isRunning) { state.game.running = isRunning; if (!isRunning) state.game.injected = []; push(); },
  };
  return { on, send, mock: true, dev };
})();