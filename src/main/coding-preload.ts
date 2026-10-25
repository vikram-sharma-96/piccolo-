import { contextBridge, ipcRenderer } from "electron";
import type { CodingBridge } from "../shared/coding";
const appearance =
  process.argv
    .find((arg) => arg.startsWith("--piccolo-appearance="))
    ?.split("=")[1] === "light"
    ? "light"
    : "dark";
const initialize = () => {
  if (!document.documentElement) return false;
  document.documentElement.dataset.theme = appearance;
  return true;
};
if (!initialize()) {
  const observer = new MutationObserver(() => {
    if (initialize()) observer.disconnect();
  });
  observer.observe(document, { childList: true });
}
const bridge: CodingBridge = {
  request: (request) => ipcRenderer.invoke("piccolo-code:request", request),
  subscribe: (callback) => {
    const listener = (_: unknown, event: any) => callback(event);
    ipcRenderer.on("piccolo-code:event", listener);
    return () => ipcRenderer.removeListener("piccolo-code:event", listener);
  },
};
contextBridge.exposeInMainWorld("piccoloCode", bridge);
