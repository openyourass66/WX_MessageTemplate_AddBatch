import pkg from "electron";
const { app, BrowserWindow, ipcMain } = pkg;
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// In packaged app __dirname is inside read-only app.asar — use userData for writable files
const DATA_DIR = app.isPackaged
  ? path.join(app.getPath("userData"), "data")
  : __dirname;
let mainWindow = null;

// -- Window --

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 780,
    minWidth: 900,
    minHeight: 600,
    title: "微信小程序订阅消息模板批量工具",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  mainWindow.loadFile(path.join(__dirname, "renderer", "index.html"));
}

// -- Helpers --

function sendLog(text, type = "stdout") {
  mainWindow?.webContents.send("script-log", { type, text });
}

function runScript(scriptRelPath, args = []) {
  return new Promise((resolve, reject) => {
    const scriptPath = path.join(__dirname, scriptRelPath);

    // In packaged app the scripts are inside app.asar which child
    // processes cannot read.  Extract to a temp file first.
    let execPath = scriptPath;
    let cleanup = null;

    if (scriptPath.includes(".asar")) {
      const src = fs.readFileSync(scriptPath, "utf8");
      const tmpPath = path.join(
        os.tmpdir(),
        `wx-tool-${path.basename(scriptRelPath)}`,
      );
      fs.writeFileSync(tmpPath, src, "utf8");
      execPath = tmpPath;
      cleanup = () => {
        try { fs.unlinkSync(tmpPath); } catch {}
      };
    }

    const child = spawn(process.execPath, [execPath, ...args], {
      cwd: DATA_DIR,
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
        ELECTRON_RUN_AS_NODE: "1",
      },
    });
    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (d) => {
      const t = d.toString();
      stdout += t;
      sendLog(t);
    });
    child.stderr.on("data", (d) => {
      const t = d.toString();
      stderr += t;
      sendLog(t, "stderr");
    });
    child.on("close", (code) => {
      if (cleanup) cleanup();
      sendLog(`\n进程退出, 状态码: ${code}\n`);
      if (code === 0) resolve({ stdout, stderr, code });
      else reject(new Error(stderr || `进程退出码: ${code}`));
    });
    child.on("error", (err) => {
      if (cleanup) cleanup();
      sendLog(`启动失败: ${err.message}\n`, "error");
      reject(err);
    });
  });
}

function readJSON(filePath) {
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJSON(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
}

function findLatestExport() {
  const dir = path.join(DATA_DIR, "exports");
  if (!fs.existsSync(dir)) return null;
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.startsWith("templates-") && f.endsWith(".json"))
    .map((f) => ({ name: f, ctime: fs.statSync(path.join(dir, f)).ctime }))
    .sort((a, b) => b.ctime - a.ctime);
  return files.length > 0 ? files[0].name : null;
}

function findLatestResult() {
  const dir = path.join(DATA_DIR, "exports");
  if (!fs.existsSync(dir)) return null;
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.startsWith("add-template-results-") && f.endsWith(".json"))
    .map((f) => ({ name: f, ctime: fs.statSync(path.join(dir, f)).ctime }))
    .sort((a, b) => b.ctime - a.ctime);
  return files.length > 0 ? files[0].name : null;
}

// -- Config --

function readEnv() {
  const p = path.join(DATA_DIR, ".env");
  if (!fs.existsSync(p)) return {};
  const env = {};
  for (const line of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i === -1) continue;
    env[t.slice(0, i).trim()] = t.slice(i + 1).trim().replace(/^['"]|['"]$/g, "");
  }
  return env;
}

function writeEnv(env) {
  const p = path.join(DATA_DIR, ".env");
  fs.writeFileSync(
    p,
    Object.entries(env)
      .filter(([, v]) => v)
      .map(([k, v]) => `${k}=${v}`)
      .join("\n"),
    "utf8"
  );
}

function readTargets() {
  const p = path.join(DATA_DIR, "targets.json");
  return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, "utf8")) : [];
}

// -- IPC Handlers --

ipcMain.handle("config:readEnv", () => readEnv());
ipcMain.handle("config:writeEnv", (_, e) => writeEnv(e));
ipcMain.handle("config:readTargets", () => readTargets());
ipcMain.handle("config:writeTargets", (_, t) => {
  writeJSON(path.join(DATA_DIR, "targets.json"), t);
});

// Export templates
ipcMain.handle("script:export", async (_, options) => {
  const args = [];
  if (options.appid) args.push("--appid", options.appid);
  if (options.secret) args.push("--secret", options.secret);
  if (options.accessToken) args.push("--access-token", options.accessToken);

  await runScript("scripts/export-miniapp-templates.mjs", args);

  const latest = findLatestExport();
  if (!latest) return null;
  return readJSON(path.join(DATA_DIR, "exports", latest));
});

// Add templates — accepts in-memory data, writes temp files, runs script, returns result
ipcMain.handle("script:addTemplates", async (_, options) => {
  // Validate data before calling the CLI script
  if (!options.templates || !Array.isArray(options.templates) || options.templates.length === 0) {
    throw new Error("没有选择任何模板，请先导出并选择模板。");
  }
  if (!options.targets || !Array.isArray(options.targets) || options.targets.length === 0) {
    throw new Error("没有有效的目标小程序，请先在「目标小程序」标签页中添加并保存。当前数据: " + JSON.stringify(options.targets));
  }

  const tmpDir = path.join(DATA_DIR, "exports");

  // Write templates data to temp file
  const templatesPath = path.join(tmpDir, ".gui-templates.json");
  writeJSON(templatesPath, { templates: options.templates });

  // Write targets data to temp file
  const targetsPath = path.join(tmpDir, ".gui-targets.json");
  writeJSON(targetsPath, options.targets);

  // Output path with timestamp
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outPath = path.join(tmpDir, `add-template-results-${timestamp}.json`);

  const args = [
    "--templates", templatesPath,
    "--targets", targetsPath,
    "--out", outPath,
  ];
  if (options.dryRun) args.push("--dry-run");

  await runScript("scripts/add-templates-to-miniapps.mjs", args);

  // Read and return the result
  return readJSON(outPath);
});

// Template persistence (auto-save/load last exported templates)
ipcMain.handle("templates:saveCurrent", (_, templates) => {
  writeJSON(path.join(DATA_DIR, "exports", ".current-templates.json"), { templates });
});
ipcMain.handle("templates:loadCurrent", () => {
  return readJSON(path.join(DATA_DIR, "exports", ".current-templates.json"));
});

// File reading
ipcMain.handle("fs:readJSON", (_, filePath) => readJSON(filePath));

// Latest export metadata (list of export files)
ipcMain.handle("fs:listExports", () => {
  const dir = path.join(DATA_DIR, "exports");
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".json") && !f.startsWith("."))
    .map((f) => ({ name: f, ctime: fs.statSync(path.join(dir, f)).ctime }))
    .sort((a, b) => b.ctime - a.ctime)
    .slice(0, 20);
});

// -- App lifecycle --

app.whenReady().then(createWindow);
app.on("window-all-closed", () => app.quit());
app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
