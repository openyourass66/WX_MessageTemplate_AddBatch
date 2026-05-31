const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("api", {
  // Config
  readEnv: () => ipcRenderer.invoke("config:readEnv"),
  writeEnv: (env) => ipcRenderer.invoke("config:writeEnv", env),
  readTargets: () => ipcRenderer.invoke("config:readTargets"),
  writeTargets: (targets) => ipcRenderer.invoke("config:writeTargets", targets),

  // Scripts
  exportTemplates: (options) => ipcRenderer.invoke("script:export", options),
  addTemplates: (options) => ipcRenderer.invoke("script:addTemplates", options),

  // Templates persistence
  saveCurrentTemplates: (templates) => ipcRenderer.invoke("templates:saveCurrent", templates),
  loadCurrentTemplates: () => ipcRenderer.invoke("templates:loadCurrent"),

  // Files
  readJSON: (filePath) => ipcRenderer.invoke("fs:readJSON", filePath),
  listExports: () => ipcRenderer.invoke("fs:listExports"),

  // Log listener
  onScriptLog: (callback) => {
    const fn = (_, data) => callback(data);
    ipcRenderer.on("script-log", fn);
    return () => ipcRenderer.removeListener("script-log", fn);
  },
});
