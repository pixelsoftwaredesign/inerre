// PixelSoftwareDesign2026@
const { app, BrowserWindow, dialog, ipcMain } = require("electron");
const path = require("path");
const fs = require("fs");

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    title: "Inerre Studio",
    backgroundColor: "#111315",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, "../../index.html"));
  mainWindow.on("closed", () => { mainWindow = null; });
}

app.whenReady().then(createWindow);
app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
app.on("activate", () => { if (mainWindow === null) createWindow(); });

// File dialogs via IPC
ipcMain.handle("dialog:openFile", async (event, filters) => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ["openFile"],
    filters: filters || [{ name: "Tous", extensions: ["*"] }],
  });
  if (result.canceled) return null;
  const filePath = result.filePaths[0];
  const content = fs.readFileSync(filePath, "utf-8");
  return { content, fileName: path.basename(filePath), filePath };
});

ipcMain.handle("dialog:saveFile", async (event, { content, defaultName, filters }) => {
  const result = await dialog.showSaveDialog(mainWindow, {
    defaultPath: defaultName || "projet.pix",
    filters: filters || [{ name: "Projet Inerre", extensions: ["pix"] }],
  });
  if (result.canceled) return false;
  fs.writeFileSync(result.filePath, content, "utf-8");
  return true;
});

ipcMain.handle("dialog:saveBinary", async (event, { buffer, defaultName, filters }) => {
  const result = await dialog.showSaveDialog(mainWindow, {
    defaultPath: defaultName || "export.glb",
    filters: filters || [{ name: "GLB", extensions: ["glb"] }],
  });
  if (result.canceled) return false;
  fs.writeFileSync(result.filePath, Buffer.from(buffer));
  return true;
});

ipcMain.handle("app:getPath", (event, name) => app.getPath(name));
