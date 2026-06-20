// Minimal, audited bridge between renderer and main. No node access leaks
// to the page — only these four typed calls.
import { contextBridge, ipcRenderer } from "electron";
import type { DayLog, Phase } from "@daybreak/core";

export interface DaybreakBridge {
  load: () => Promise<{ phase: Phase; log: DayLog; now: string }>;
  save: (p: { log: DayLog; phase: Phase }) => Promise<{ canDismiss: boolean }>;
  dismiss: (p: { log: DayLog; phase: Phase }) => Promise<{ closed: boolean }>;
  onNudge: (cb: () => void) => void;
}

const bridge: DaybreakBridge = {
  load: () => ipcRenderer.invoke("daybreak:load"),
  save: (p) => ipcRenderer.invoke("daybreak:save", p),
  dismiss: (p) => ipcRenderer.invoke("daybreak:dismiss", p),
  onNudge: (cb) => ipcRenderer.on("daybreak:nudge", () => cb()),
};

contextBridge.exposeInMainWorld("daybreak", bridge);
