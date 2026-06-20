// Daybreak renderer. Pure DOM + @daybreak/core. No business logic lives here
// that isn't already covered by core's tested functions.
import {
  applyWipe,
  canDismiss,
  committedCount,
  currentStreak,
  isOverCommitted,
  makeItem,
  MAX_DAILY_COMMITS,
  type DayLog,
  type Item,
  type Phase,
  type WipeAction,
} from "@daybreak/core";
import type { DaybreakBridge } from "../main/preload";

declare global {
  interface Window {
    daybreak: DaybreakBridge;
  }
}

const api = window.daybreak;

let log: DayLog;
let phase: Phase;
let now: Date;

const $ = (id: string) => document.getElementById(id)!;

async function boot() {
  const loaded = await api.load();
  phase = loaded.phase;
  log = loaded.log;
  now = new Date(loaded.now);
  api.onNudge(() => flashHint("Wipe every item before Daybreak will close."));
  render();
  await persist();
}

function phaseLabel(): string {
  return phase === "morning"
    ? "What are you committing to today?"
    : "How did today actually go?";
}

function morningActions(): WipeAction[] {
  return ["commit", "defer", "kill"];
}
function eveningActions(): WipeAction[] {
  return ["done", "defer", "kill"];
}

function actionsFor(): WipeAction[] {
  return phase === "morning" ? morningActions() : eveningActions();
}

function actionLabel(a: WipeAction): string {
  return { commit: "Commit", done: "Done", defer: "Defer", kill: "Kill" }[a];
}

function render() {
  ($("phase-title") as HTMLElement).textContent = phaseLabel();

  // We only have today's board client-side; streak uses the single day we know
  // plus whatever the main process surfaced. Streak display is informational.
  const streak = currentStreak([log], now);
  ($("streak") as HTMLElement).textContent =
    streak > 0 ? `${streak}-day streak` : "Start your streak today";

  const board = $("board");
  board.innerHTML = "";
  for (const item of log.items) {
    board.appendChild(renderItem(item));
  }

  const addForm = $("add-form") as HTMLFormElement;
  addForm.style.display = phase === "morning" ? "flex" : "none";

  updateGate();
}

function renderItem(item: Item): HTMLElement {
  const row = document.createElement("div");
  row.className = `item state-${item.state}`;
  row.dataset.id = item.id;

  const text = document.createElement("span");
  text.className = "item-text";
  text.textContent = item.text;
  if (item.carryCount > 0) {
    const badge = document.createElement("span");
    badge.className = "carry";
    badge.textContent = `carried ×${item.carryCount}`;
    text.appendChild(badge);
  }
  row.appendChild(text);

  const actions = document.createElement("div");
  actions.className = "actions";
  for (const a of actionsFor()) {
    const btn = document.createElement("button");
    btn.className = `wipe wipe-${a}`;
    btn.textContent = actionLabel(a);
    btn.onclick = () => wipe(item.id, a);
    actions.appendChild(btn);
  }
  row.appendChild(actions);
  return row;
}

function wipe(id: string, action: WipeAction) {
  log = {
    ...log,
    items: log.items.map((i) => (i.id === id ? applyWipe(i, action, phase) : i)),
  };
  render();
  void persist();
}

function addCommit(text: string) {
  if (!text.trim()) return;
  if (isOverCommitted([...log.items, makeItem(text, log.day)])) {
    flashHint(`Three is the cap. You have ${committedCount(log.items)} live.`);
    return;
  }
  log = { ...log, items: [...log.items, makeItem(text, log.day)] };
  render();
  void persist();
}

function updateGate() {
  const ok = canDismiss(log.items, phase);
  const doneBtn = $("done-btn") as HTMLButtonElement;
  doneBtn.disabled = !ok;
  ($("hint") as HTMLElement).textContent = ok
    ? "Board is clear. You're free to go."
    : phase === "morning"
      ? `Wipe each item. Up to ${MAX_DAILY_COMMITS} commitments.`
      : "Mark each item done, deferred, or killed.";
}

function flashHint(msg: string) {
  const hint = $("hint") as HTMLElement;
  hint.textContent = msg;
  hint.classList.add("flash");
  setTimeout(() => hint.classList.remove("flash"), 900);
}

async function persist() {
  log = { ...log, morningResolved: canDismiss(log.items, "morning") };
  await api.save({ log, phase });
  updateGate();
}

async function tryClose() {
  if (!canDismiss(log.items, phase)) {
    flashHint("Not yet — wipe everything first.");
    return;
  }
  await api.dismiss({ log, phase });
}

window.addEventListener("DOMContentLoaded", () => {
  ($("add-form") as HTMLFormElement).addEventListener("submit", (e) => {
    e.preventDefault();
    const input = $("add-input") as HTMLInputElement;
    addCommit(input.value);
    input.value = "";
  });
  ($("done-btn") as HTMLButtonElement).addEventListener("click", () => {
    void tryClose();
  });
  void boot();
});
