const { app, BrowserWindow, dialog, ipcMain, Menu, shell } = require("electron");
const fsp = require("node:fs/promises");
const path = require("node:path");
const { validateCrownlandsProject } = require("./project-file-service");
const { AiWorkspaceService } = require("./ai/ai-workspace-service");
const { validateRetry, validateTaskId } = require("./ai/ipc-schema");
const { createReadOnlyPreviewServer } = require("./ai/preview-server");
const { SourceControlService, UI_EDITABLE_FILES } = require("./source-control-service");

const SETTINGS_FILE = "settings.json";
const HOST = "127.0.0.1";

let mainWindow = null;
let projectServer = null;
let projectRoot = "";
let editorOrigin = "";
let dirty = false;
let allowClose = false;
let pendingAfterSave = "";
let aiService = null;
let sourceControl = null;
const previewWindows = new Set();

function settingsPath() {
  return path.join(app.getPath("userData"), SETTINGS_FILE);
}

async function readSettings() {
  try {
    return JSON.parse(await fsp.readFile(settingsPath(), "utf8"));
  } catch (error) {
    if (error.code !== "ENOENT") console.warn("Could not read Studio settings:", error);
    return {};
  }
}

async function writeSettings(value) {
  const target = settingsPath();
  const temp = `${target}.${process.pid}.tmp`;
  await fsp.mkdir(path.dirname(target), { recursive: true });
  await fsp.writeFile(temp, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await fsp.rename(temp, target);
}

async function stopProjectServer() {
  const active = projectServer;
  projectServer = null;
  editorOrigin = "";
  if (!active?.listening) return;
  await new Promise(resolve => active.close(() => resolve()));
}

async function stopAiWorkspace() {
  aiService?.dispose();
  aiService?.removeAllListeners();
  aiService = null;
  sourceControl = null;
  for (const preview of previewWindows) preview.close();
  previewWindows.clear();
}

async function startProjectServer(root) {
  await stopProjectServer();
  const serverEntry = path.join(root, "tools", "editor-server.js");
  delete require.cache[require.resolve(serverEntry)];
  process.env.CROWNLANDS_STUDIO_DESKTOP = "1";
  const { createServer } = require(serverEntry);
  if (typeof createServer !== "function") throw new Error("The selected project does not export the Crownlands Studio server.");
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, HOST, () => {
      server.removeListener("error", reject);
      resolve();
    });
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Studio could not determine its local service address.");
  projectServer = server;
  editorOrigin = `http://${HOST}:${address.port}`;
  return `${editorOrigin}/editor/`;
}

async function selectProject(options = {}) {
  const result = await dialog.showOpenDialog(mainWindow || undefined, {
    title: options.title || "Select a Crownlands project folder",
    defaultPath: options.defaultPath || projectRoot || app.getPath("documents"),
    properties: ["openDirectory"],
    buttonLabel: "Open Crownlands Project",
  });
  if (result.canceled || !result.filePaths[0]) return null;
  const validation = await validateCrownlandsProject(result.filePaths[0]);
  if (!validation.valid) {
    const detail = [
      ...validation.errors,
      validation.missing.length ? `Missing required files:\n${validation.missing.join("\n")}` : "",
    ].filter(Boolean).join("\n\n");
    await dialog.showMessageBox(mainWindow || undefined, {
      type: "error",
      title: "Not a compatible Crownlands project",
      message: "Studio could not open that folder safely.",
      detail,
    });
    return selectProject({ ...options, defaultPath: path.dirname(validation.root || result.filePaths[0]) });
  }
  return validation.root;
}

async function resolveInitialProject() {
  const projectArgument = process.argv.find(argument => argument.startsWith("--project="));
  if (projectArgument) {
    const validation = await validateCrownlandsProject(projectArgument.slice("--project=".length));
    if (validation.valid) return validation.root;
    console.warn("Ignoring invalid --project argument:", validation);
  }
  const settings = await readSettings();
  if (settings.lastProjectRoot) {
    const validation = await validateCrownlandsProject(settings.lastProjectRoot);
    if (validation.valid) return validation.root;
  }
  return selectProject();
}

function installMenu() {
  const template = [
    {
      label: "File",
      submenu: [
        { label: "Open Project…", accelerator: "CmdOrCtrl+O", click: () => requestOpenProject() },
        { label: "Save", accelerator: "CmdOrCtrl+S", click: () => mainWindow?.webContents.send("studio:request-save") },
        { type: "separator" },
        { label: "Exit", accelerator: "Alt+F4", click: () => promptForUnsaved("close").catch(showFatalError) },
      ],
    },
    { label: "Edit", submenu: [{ role: "undo" }, { role: "redo" }, { type: "separator" }, { role: "cut" }, { role: "copy" }, { role: "paste" }, { role: "selectAll" }] },
    { label: "View", submenu: [{ role: "reload" }, { role: "forceReload" }, { role: "toggleDevTools" }, { type: "separator" }, { role: "resetZoom" }, { role: "zoomIn" }, { role: "zoomOut" }, { role: "togglefullscreen" }] },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

async function openProject(root) {
  await stopAiWorkspace();
  const url = await startProjectServer(root);
  projectRoot = root;
  dirty = false;
  pendingAfterSave = "";
  aiService = await new AiWorkspaceService(root, { dirtyProvider: () => dirty }).init();
  sourceControl = new SourceControlService(root);
  aiService.on("task-updated", task => mainWindow?.webContents.send("studio:ai-task-updated", task));
  await writeSettings({ schemaVersion: 1, lastProjectRoot: root });
  await mainWindow.loadURL(url);
  mainWindow.setTitle(`Crownlands Studio — ${path.basename(root)}`);
}

function requireAiWorkspace() {
  if (!aiService) throw new Error("The Codex AI workspace is not ready for the selected project.");
  return aiService;
}

function requireSourceControl() {
  if (!sourceControl) throw new Error("Source control is not ready for the selected project.");
  return sourceControl;
}

async function confirmSourceCommit(payload = {}) {
  const message = String(payload.message || "").trim();
  const files = Array.isArray(payload.files) ? payload.files : [...UI_EDITABLE_FILES];
  const result = await dialog.showMessageBox(mainWindow || undefined, {
    type: "question",
    title: "Commit manual UI changes",
    message: `Commit ${files.length} saved UI file${files.length === 1 ? "" : "s"}?`,
    detail: `${message}\n\n${files.join("\n")}\n\nThis does not push, merge, or deploy.`,
    buttons: ["Commit", "Cancel"],
    defaultId: 1,
    cancelId: 1,
    noLink: true,
  });
  if (result.response !== 0) return { cancelled: true };
  return requireSourceControl().commit({ message, files });
}

async function confirmSourcePush() {
  const plan = await requireSourceControl().pushPlan();
  const result = await dialog.showMessageBox(mainWindow || undefined, {
    type: "warning",
    title: "Push Crownlands branch",
    message: `Push ${plan.branch} to ${plan.remote}?`,
    detail: `Commit: ${plan.head}\nDestination: ${plan.remoteUrl}\n\nThis pushes only. It does not merge or deploy.`,
    buttons: ["Push Branch", "Cancel"],
    defaultId: 1,
    cancelId: 1,
    noLink: true,
  });
  if (result.response !== 0) return { cancelled: true, plan };
  return requireSourceControl().push({ confirmed: true });
}

async function captureAiContext(payload) {
  const taskId = validateTaskId(payload);
  if (!mainWindow || mainWindow.isDestroyed()) throw new Error("Studio window is not available for screenshot capture.");
  const image = await mainWindow.webContents.capturePage();
  if (image.isEmpty()) throw new Error("Studio could not capture the current view.");
  return requireAiWorkspace().attachScreenshot(taskId, image.toPNG());
}

async function openTaskPreview(payload) {
  const taskId = validateTaskId(payload);
  const task = await requireAiWorkspace().getPreviewTask(taskId);
  const server = createReadOnlyPreviewServer(task.worktree);
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, HOST, () => { server.removeListener("error", reject); resolve(); });
  });
  const address = server.address();
  if (!address || typeof address === "string") {
    server.close();
    throw new Error("Studio could not determine the read-only preview address.");
  }
  const preview = new BrowserWindow({
    parent: mainWindow || undefined,
    width: 1280,
    height: 820,
    minWidth: 720,
    minHeight: 480,
    title: `Task Preview — ${task.title}`,
    backgroundColor: "#1b1410",
    icon: path.join(__dirname, "build", "icon.png"),
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  previewWindows.add(preview);
  const origin = `http://${HOST}:${address.port}`;
  preview.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  preview.webContents.on("will-navigate", event => {
    try { if (new URL(event.url).origin === origin) return; } catch { /* denied below */ }
    event.preventDefault();
  });
  preview.on("closed", () => {
    previewWindows.delete(preview);
    server.close();
  });
  const context = (await requireAiWorkspace().getTask(taskId)).context || {};
  const route = context.component ? "/editor/component-preview.html" : context.screen ? "/editor/screen-preview.html" : "/editor/";
  await preview.loadURL(`${origin}${route}`);
  return { opened: true, route };
}

async function confirmAiAction(payload, action) {
  const taskId = validateTaskId(payload);
  const service = requireAiWorkspace();
  const task = await service.getTask(taskId);
  const applying = action === "apply";
  const result = await dialog.showMessageBox(mainWindow || undefined, {
    type: applying ? "question" : "warning",
    title: applying ? "Apply Codex task" : "Discard Codex task",
    message: applying
      ? `Apply every reviewed change from “${task.title}” to the active Crownlands project?`
      : `Permanently discard “${task.title}” and its isolated worktree/branch?`,
    detail: applying
      ? `Branch: ${task.branch || "review-only"}\nFiles: ${(task.filesChanged || []).length}\n\nStudio will recheck the active project and save a recovery patch. It will not commit, merge, push, or deploy.`
      : `Branch: ${task.branch || "none"}\nWorktree: ${task.worktree || "none"}\n\nApplied project changes are never removed by this action.`,
    buttons: [applying ? "Apply Complete Task" : "Discard Isolated Task", "Cancel"],
    defaultId: 1,
    cancelId: 1,
    noLink: true,
  });
  if (result.response !== 0) return task;
  return applying ? service.applyTask(taskId) : service.discardTask(taskId);
}

async function chooseAndOpenProject() {
  const selected = await selectProject();
  if (!selected || selected === projectRoot) return false;
  await openProject(selected);
  return true;
}

async function promptForUnsaved(action) {
  if (!dirty) return action === "close" ? closeNow() : chooseAndOpenProject();
  const result = await dialog.showMessageBox(mainWindow, {
    type: "warning",
    title: "Unsaved Crownlands Studio changes",
    message: "Save changes before continuing?",
    detail: action === "close" ? "Closing now would discard unsaved Studio changes." : "Opening another project now would discard unsaved Studio changes.",
    buttons: ["Save", "Discard", "Cancel"],
    defaultId: 0,
    cancelId: 2,
    noLink: true,
  });
  if (result.response === 2) return false;
  if (result.response === 1) return action === "close" ? closeNow() : chooseAndOpenProject();
  pendingAfterSave = action;
  mainWindow.webContents.send("studio:request-save");
  return false;
}

function closeNow() {
  allowClose = true;
  mainWindow?.close();
  return true;
}

async function requestOpenProject() {
  return promptForUnsaved("open-project");
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1540,
    height: 980,
    minWidth: 1180,
    minHeight: 720,
    show: false,
    backgroundColor: "#1b1410",
    icon: path.join(__dirname, "build", "icon.png"),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) shell.openExternal(url);
    return { action: "deny" };
  });
  mainWindow.webContents.on("will-navigate", event => {
    try {
      if (new URL(event.url).origin === editorOrigin) return;
    } catch {
      // Invalid navigation targets are denied below.
    }
    event.preventDefault();
  });
  mainWindow.webContents.on("will-prevent-unload", event => {
    if (allowClose) event.preventDefault();
  });
  mainWindow.on("close", event => {
    if (allowClose || !dirty) return;
    event.preventDefault();
    promptForUnsaved("close").catch(showFatalError);
  });
  mainWindow.on("closed", () => { mainWindow = null; });
  mainWindow.once("ready-to-show", () => mainWindow?.show());
}

async function showFatalError(error) {
  console.error(error);
  await dialog.showMessageBox(mainWindow || undefined, {
    type: "error",
    title: "Crownlands Studio",
    message: "Studio encountered an error.",
    detail: error?.stack || error?.message || String(error),
  });
}

ipcMain.on("studio:dirty-changed", (_event, value) => { dirty = Boolean(value); });
ipcMain.handle("studio:open-project", () => requestOpenProject());
ipcMain.handle("studio:source-status", () => requireSourceControl().status());
ipcMain.handle("studio:source-diff", (_event, payload) => requireSourceControl().diff(payload?.files));
ipcMain.handle("studio:source-commit", (_event, payload) => confirmSourceCommit(payload));
ipcMain.handle("studio:source-push", () => confirmSourcePush());
ipcMain.handle("studio:ai-capabilities", () => requireAiWorkspace().getCapabilities());
ipcMain.handle("studio:ai-list-tasks", () => requireAiWorkspace().listTasks());
ipcMain.handle("studio:ai-get-task", (_event, payload) => requireAiWorkspace().getTask(validateTaskId(payload)));
ipcMain.handle("studio:ai-plan-task", (_event, payload) => requireAiWorkspace().planTask(payload));
ipcMain.handle("studio:ai-run-task", (_event, payload) => requireAiWorkspace().runTask(validateTaskId(payload)));
ipcMain.handle("studio:ai-cancel-task", (_event, payload) => requireAiWorkspace().cancelTask(validateTaskId(payload)));
ipcMain.handle("studio:ai-retry-task", (_event, payload) => {
  const request = validateRetry(payload);
  return requireAiWorkspace().retryTask(request.taskId, { escalate: request.escalate });
});
ipcMain.handle("studio:ai-get-diff", (_event, payload) => requireAiWorkspace().getDiff(validateTaskId(payload)));
ipcMain.handle("studio:ai-apply-task", (_event, payload) => confirmAiAction(payload, "apply"));
ipcMain.handle("studio:ai-discard-task", (_event, payload) => confirmAiAction(payload, "discard"));
ipcMain.handle("studio:ai-get-settings", () => requireAiWorkspace().getSettings());
ipcMain.handle("studio:ai-save-settings", (_event, payload) => requireAiWorkspace().saveSettings(payload));
ipcMain.handle("studio:ai-capture-context", (_event, payload) => captureAiContext(payload));
ipcMain.handle("studio:ai-preview-task", (_event, payload) => openTaskPreview(payload));
ipcMain.on("studio:save-result", (_event, result) => {
  if (!result?.ok) {
    pendingAfterSave = "";
    if (result?.message) showFatalError(new Error(result.message));
    return;
  }
  dirty = false;
  const action = pendingAfterSave;
  pendingAfterSave = "";
  if (action === "close") closeNow();
  else if (action === "open-project") chooseAndOpenProject().catch(showFatalError);
});

app.whenReady().then(async () => {
  installMenu();
  const initialProject = await resolveInitialProject();
  if (!initialProject) {
    app.quit();
    return;
  }
  createWindow();
  await openProject(initialProject);
}).catch(async error => {
  await showFatalError(error);
  app.quit();
});

app.on("window-all-closed", () => app.quit());
app.on("quit", () => {
  aiService?.dispose();
  if (projectServer?.listening) projectServer.close();
});
