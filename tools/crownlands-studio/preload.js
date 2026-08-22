const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("crownlandsDesktop", Object.freeze({
  isDesktop: true,
  updateDirty(dirty) {
    ipcRenderer.send("studio:dirty-changed", Boolean(dirty));
  },
  openProject() {
    return ipcRenderer.invoke("studio:open-project");
  },
  onSaveRequested(callback) {
    if (typeof callback !== "function") return () => {};
    const listener = () => callback();
    ipcRenderer.on("studio:request-save", listener);
    return () => ipcRenderer.removeListener("studio:request-save", listener);
  },
  notifySaveResult(result) {
    ipcRenderer.send("studio:save-result", {
      ok: Boolean(result?.ok),
      message: String(result?.message || ""),
    });
  },
  sourceControl: Object.freeze({
    status: () => ipcRenderer.invoke("studio:source-status"),
    diff: files => ipcRenderer.invoke("studio:source-diff", { files }),
    commit: payload => ipcRenderer.invoke("studio:source-commit", payload),
    push: () => ipcRenderer.invoke("studio:source-push"),
  }),
  ai: Object.freeze({
    getCapabilities: () => ipcRenderer.invoke("studio:ai-capabilities"),
    listTasks: () => ipcRenderer.invoke("studio:ai-list-tasks"),
    getTask: taskId => ipcRenderer.invoke("studio:ai-get-task", { taskId }),
    planTask: payload => ipcRenderer.invoke("studio:ai-plan-task", payload),
    runTask: taskId => ipcRenderer.invoke("studio:ai-run-task", { taskId }),
    cancelTask: taskId => ipcRenderer.invoke("studio:ai-cancel-task", { taskId }),
    retryTask: (taskId, escalate = false) => ipcRenderer.invoke("studio:ai-retry-task", { taskId, escalate: Boolean(escalate) }),
    getDiff: taskId => ipcRenderer.invoke("studio:ai-get-diff", { taskId }),
    applyTask: taskId => ipcRenderer.invoke("studio:ai-apply-task", { taskId }),
    discardTask: taskId => ipcRenderer.invoke("studio:ai-discard-task", { taskId }),
    getSettings: () => ipcRenderer.invoke("studio:ai-get-settings"),
    saveSettings: payload => ipcRenderer.invoke("studio:ai-save-settings", payload),
    captureContext: taskId => ipcRenderer.invoke("studio:ai-capture-context", { taskId }),
    previewTask: taskId => ipcRenderer.invoke("studio:ai-preview-task", { taskId }),
    onTaskUpdated(callback) {
      if (typeof callback !== "function") return () => {};
      const listener = (_event, task) => callback(task);
      ipcRenderer.on("studio:ai-task-updated", listener);
      return () => ipcRenderer.removeListener("studio:ai-task-updated", listener);
    },
  }),
}));
