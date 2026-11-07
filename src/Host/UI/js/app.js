// Draws the launcher. All real work happens in C#; this file only shows state and sends clicks.
// Everything is rendered with textContent, so data from the host can never inject HTML.

const $ = (sel, root = document) => root.querySelector(sel);

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

let model = { mods: [], game: { running: false, injected: [] }, settings: {}, server: "online", launcherVersion: "" };
let launcherUpdate = { status: "idle" };   // the launcher's own update state, sent by the host
const busy = {};   // mod id -> { percent, label } while that mod is installing, updating, launching...

// ---------- Formatting ----------
function fmtSize(bytes) {
  if (bytes >= 1e9) return (bytes / 1e9).toFixed(1) + " GB";
  if (bytes >= 1e6) return Math.round(bytes / 1e6) + " MB";
  return Math.round(bytes / 1e3) + " KB";
}
const fmtDate = iso =>
  new Date(iso + "T00:00:00").toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });

// ---------- What the button should say ----------
function actionFor(mod, game) {
  if (!mod.installedVersion) return { id: "install", label: "Install", busy: "Downloading" };
  if (mod.installedVersion !== mod.latestVersion)
    return { id: "update", label: "Update", busy: "Updating", disabled: game.running, hint: "Close the game to update." };
  if (!game.running) return { id: "launch", label: "Launch", busy: "Starting game" };
  if (!game.injected.includes(mod.id)) return { id: "inject", label: "Inject", busy: "Injecting" };
  return { id: null, label: "Running", disabled: true };
}

// ---------- Mods page ----------
function statusTag(mod) {
  if (!mod.installedVersion) return null;
  return mod.installedVersion === mod.latestVersion
    ? el("span", "tag", "Installed")
    : el("span", "tag tag-hot", "Update available");
}

function metaList(mod) {
  const items = [["Latest version", mod.latestVersion], ["Uploaded", fmtDate(mod.uploaded)], ["Size", fmtSize(mod.size)]];
  if (mod.installedVersion) items.splice(1, 0, ["Installed", mod.installedVersion]);
  const dl = el("dl", "meta");
  for (const [label, value] of items) {
    const group = el("div");
    group.append(el("dt", "", label), el("dd", "", value));
    dl.append(group);
  }
  return dl;
}

function actionArea(mod) {
  const box = el("div", "mod-action");
  const work = busy[mod.id];
  if (work) {
    const progress = el("div", "progress");
    const track = el("div", "track");
    const fill = el("div", "fill");
    fill.style.width = work.percent + "%";
    track.append(fill);
    progress.append(track, el("div", "progress-label", `${work.label}… ${work.percent}%`));
    box.append(progress);
    return box;
  }
  const action = actionFor(mod, model.game);
  const button = el("button", action.disabled ? "btn btn-ghost" : "btn btn-primary", action.label);
  button.disabled = !!action.disabled;
  if (action.id) {
    button.onclick = () => {
      busy[mod.id] = { percent: 0, label: action.busy };
      renderMods();
      host.send({ type: "action", mod: mod.id, action: action.id });
    };
  }
  box.append(button);
  if (action.disabled && action.hint) box.append(el("div", "hint", action.hint));
  return box;
}

function modCard(mod) {
  const card = el("article", "mod");
  card.dataset.id = mod.id;
  const main = el("div");
  const head = el("div", "mod-head");
  head.append(el("h2", "", mod.name));
  const tag = statusTag(mod);
  if (tag) head.append(tag);
  main.append(head, el("p", "mod-desc", mod.description), metaList(mod));
  card.append(main, actionArea(mod));
  return card;
}

function renderMods() {
  const list = $("#mod-list");
  list.replaceChildren(...model.mods.map(modCard));
}

// ---------- Settings page ----------
const TOGGLES = [
  { key: "autoUpdate", title: "Update mods automatically", desc: "Install new versions when the launcher starts." },
  { key: "closeOnLaunch", title: "Close the launcher after launching", desc: "Frees up memory while you play." },
];

function toggleRow(setting) {
  const row = el("div", "row");
  const text = el("div");
  text.append(el("h3", "", setting.title), el("p", "", setting.desc));
  const label = el("label", "switch");
  const input = el("input");
  input.type = "checkbox";
  input.setAttribute("role", "switch");
  input.setAttribute("aria-label", setting.title);
  input.checked = !!model.settings[setting.key];
  input.onchange = () => {
    model.settings[setting.key] = input.checked;
    host.send({ type: "setSetting", key: setting.key, value: input.checked });
  };
  label.append(input, el("span"));
  row.append(text, label);
  return row;
}

function buttonRow(title, desc, descClass, buttonText, onClick) {
  const row = el("div", "row");
  const text = el("div");
  text.append(el("h3", "", title), el("p", descClass, desc));
  const button = el("button", "btn btn-ghost btn-small", buttonText);
  button.onclick = onClick;
  row.append(text, button);
  return row;
}

function renderSettings() {
  const list = $("#settings-list");
  list.replaceChildren(
    ...TOGGLES.map(toggleRow),
    buttonRow("Game folder", model.settings.gamePath || "Not found yet", "path", "Browse",
      () => host.send({ type: "browseGameFolder" })),
    buttonRow("Verify files", "Check your installed mods and repair anything that’s missing or damaged.", "", "Verify",
      () => host.send({ type: "verify" })),
    launcherUpdateRow(),
  );
}

// ---------- Launcher self-update ----------
function updateText(u) {
  switch (u.status) {
    case "checking": return "Checking for updates…";
    case "downloading": return `Downloading ${u.version}… ${u.percent}%`;
    case "ready": return `Version ${u.version} is ready to install.`;
    case "none": return "You’re up to date.";
    case "error": return "Couldn’t check for updates.";
    case "devbuild": return "Updates are only checked in the installed launcher.";
    default: return "Not checked yet.";
  }
}

function launcherUpdateRow() {
  const row = el("div", "row");
  const text = el("div");
  const version = model.launcherVersion ? `Launcher ${model.launcherVersion}. ` : "";
  text.append(el("h3", "", "Launcher updates"), el("p", "", version + updateText(launcherUpdate)));
  const ready = launcherUpdate.status === "ready";
  const working = launcherUpdate.status === "checking" || launcherUpdate.status === "downloading";
  const button = el("button", ready ? "btn btn-primary btn-small" : "btn btn-ghost btn-small",
    ready ? "Restart to update" : "Check for updates");
  button.disabled = working;
  button.onclick = () => host.send({ type: ready ? "restartToUpdate" : "checkLauncherUpdate" });
  row.append(text, button);
  return row;
}

// The sidebar notice only appears while an update is downloading or waiting for a restart
function renderUpdate() {
  const box = $("#update-box");
  const u = launcherUpdate;
  box.replaceChildren();
  box.hidden = !(u.status === "downloading" || u.status === "ready");
  if (box.hidden) return;
  if (u.status === "downloading") {
    const track = el("div", "track");
    const fill = el("div", "fill");
    fill.style.width = u.percent + "%";
    track.append(fill);
    box.append(el("div", "", `Downloading update… ${u.percent}%`), track);
  } else {
    const button = el("button", "btn btn-primary btn-small", "Restart to update");
    button.onclick = () => host.send({ type: "restartToUpdate" });
    box.append(el("div", "", `Update ${u.version} is ready`), button);
  }
}

// ---------- Sidebar, toast, navigation ----------
function renderSidebar() {
  const status = $("#server-status");
  status.dataset.state = model.server;
  $(".label", status).textContent = model.server === "online" ? "Server online" : "Server offline";
  $("#launcher-version").textContent = model.launcherVersion ? "Launcher " + model.launcherVersion : "";
}

let toastTimer;
function showToast(message) {
  const toast = $("#toast");
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 4000);
}

function showPage(name) {
  document.querySelectorAll(".nav-item").forEach(b =>
    b.dataset.page === name ? b.setAttribute("aria-current", "page") : b.removeAttribute("aria-current"));
  $("#page-mods").hidden = name !== "mods";
  $("#page-settings").hidden = name !== "settings";
}
document.querySelectorAll(".nav-item").forEach(b => b.onclick = () => showPage(b.dataset.page));

// ---------- Title bar ----------
document.querySelectorAll(".controls button").forEach(b =>
  b.onclick = () => host.send({ type: "window", action: b.dataset.action }));
const ICON_MAX = '<rect x=".5" y=".5" width="9" height="9"/>';
const ICON_RESTORE = '<rect x=".5" y="2.5" width="7" height="7"/><path d="M2.5 2.5v-2h7v7h-2"/>';
host.on("windowState", m => { $("#maxIcon").innerHTML = m.maximized ? ICON_RESTORE : ICON_MAX; });

// ---------- Messages from the host ----------
host.on("state", m => {
  const { type, ...rest } = m;
  model = rest;
  if (rest.update) launcherUpdate = rest.update;
  renderSidebar(); renderMods(); renderSettings(); renderUpdate();
});

host.on("launcherUpdate", m => {
  launcherUpdate = m;
  renderUpdate();
  renderSettings();
});

host.on("progress", m => {
  busy[m.mod] = { percent: m.percent, label: m.label };
  const card = [...document.querySelectorAll(".mod")].find(c => c.dataset.id === m.mod);
  const fill = card && $(".fill", card);
  if (fill) {   // update the bar in place instead of redrawing the card on every tick
    fill.style.width = m.percent + "%";
    $(".progress-label", card).textContent = `${m.label}… ${m.percent}%`;
  } else renderMods();
});

host.on("busyEnd", m => { delete busy[m.mod]; renderMods(); });
host.on("error", m => showToast(m.message));

// ---------- Mock controls (only while host.js is faking the host) ----------
function mockControls() {
  const box = el("div", "dev");
  box.append(el("strong", "", "Mock controls"));
  const select = el("select");
  [["Not installed", ""], ["Installed, old version", "0.1.0"], ["Installed, up to date", "0.2.0"]].forEach(([text, value]) => {
    const option = el("option", "", text);
    option.value = value;
    select.append(option);
  });
  select.onchange = () => host.dev.installed(select.value || null);
  const label = el("label");
  const checkbox = el("input");
  checkbox.type = "checkbox";
  checkbox.onchange = () => host.dev.running(checkbox.checked);
  label.append(checkbox, " Game running");
  const simulate = el("button", "", "Simulate launcher update");
  simulate.onclick = () => host.send({ type: "checkLauncherUpdate" });
  box.append(select, label, simulate);
  document.body.append(box);
}
if (host.mock) mockControls();

host.send({ type: "getState" });