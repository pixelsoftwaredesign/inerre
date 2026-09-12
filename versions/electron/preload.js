const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  openFile: (filters) => ipcRenderer.invoke("dialog:openFile", filters),
  saveFile: (content, defaultName, filters) =>
    ipcRenderer.invoke("dialog:saveFile", { content, defaultName, filters }),
  saveBinary: (buffer, defaultName, filters) =>
    ipcRenderer.invoke("dialog:saveBinary", { buffer, defaultName, filters }),
  getPath: (name) => ipcRenderer.invoke("app:getPath", name),
});
