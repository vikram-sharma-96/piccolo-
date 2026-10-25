import { contextBridge, ipcRenderer } from "electron";
import type { Bridge } from "../shared/model";
// Apply the main process's resolved UI theme before the first stylesheet paints.
// nativeTheme.themeSource stays at system: choosing UI colors must not alter websites.
const initialAppearance =
  process.argv
    .find((arg) => arg.startsWith("--piccolo-appearance="))
    ?.split("=")[1] === "light"
    ? "light"
    : "dark";
const initializeAppearance = () => {
  if (document.documentElement) {
    document.documentElement.dataset.theme = initialAppearance;
    return true;
  }
  return false;
};
if (!initializeAppearance()) {
  const observer = new MutationObserver(() => {
    if (initializeAppearance()) observer.disconnect();
  });
  observer.observe(document, { childList: true });
}
const api: Bridge = {
  onFindFocus: (callback) => {
    const listener = () => callback();
    ipcRenderer.on("piccolo:focus-find", listener);
    return () => ipcRenderer.removeListener("piccolo:focus-find", listener);
  },
  command: (command) => ipcRenderer.invoke("piccolo:command", command),
  state: () => ipcRenderer.invoke("piccolo:state"),
  subscribe: (callback) => {
    const listener = (_: unknown, state: any) => callback(state);
    ipcRenderer.on("piccolo:state", listener);
    return () => ipcRenderer.removeListener("piccolo:state", listener);
  },
  onFocus: (callback) => {
    const listener = () => callback();
    ipcRenderer.on("piccolo:focus", listener);
    return () => ipcRenderer.removeListener("piccolo:focus", listener);
  },
  onFind: (callback) => {
    const listener = (_: unknown, result: any) => callback(result);
    ipcRenderer.on("piccolo:find", listener);
    return () => ipcRenderer.removeListener("piccolo:find", listener);
  },
};
contextBridge.exposeInMainWorld("piccolo", api);
