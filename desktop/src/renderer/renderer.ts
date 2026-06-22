// Daybreak renderer. Pure DOM + @daybreak/core. No business logic lives here
// that isn't already covered by core's tested functions.
import {
  actionForSwipe,
  applyWipe,
  canDismiss,
  currentStreak,
  makeItem,
  MAX_DAILY_COMMITS,
  resolveLogForPhase,
  validateNewCommit,
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
let activeSwipe:
  | {
      row: HTMLElement;
      itemId: string;
      pointerId: number;
      startX: number;
      startY: number;
    }
  | null = null;

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
  row.addEventListener("pointerdown", (event) => {
    startSwipe(event, row, item.id);
  });
  row.addEventListener("pointermove", updateSwipe);
  row.addEventListener("pointerup", finishSwipe);
  row.addEventListener("pointercancel", cancelSwipe);

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

function startSwipe(event: PointerEvent, row: HTMLElement, itemId: string) {
  if (event.pointerType === "mouse" && event.button !== 0) return;
  if (event.target instanceof Element && event.target.closest("button")) return;

  activeSwipe = {
    row,
    itemId,
    pointerId: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
  };
  row.setPointerCapture(event.pointerId);
  row.classList.add("dragging");
}

function updateSwipe(event: PointerEvent) {
  if (!activeSwipe || activeSwipe.pointerId !== event.pointerId) return;
  event.preventDefault();

  const deltaX = event.clientX - activeSwipe.startX;
  const deltaY = event.clientY - activeSwipe.startY;
  const previewAction = actionForSwipe({ phase, deltaX, deltaY });
  const displayX = Math.max(-140, Math.min(140, deltaX));
  const displayY =
    deltaY > 0 && Math.abs(deltaY) > Math.abs(deltaX)
      ? Math.min(120, deltaY)
      : 0;

  activeSwipe.row.style.transform = `translate(${displayX}px, ${displayY}px)`;
  setSwipePreview(activeSwipe.row, previewAction);
}

function finishSwipe(event: PointerEvent) {
  if (!activeSwipe || activeSwipe.pointerId !== event.pointerId) return;

  const { row, itemId, startX, startY } = activeSwipe;
  const action = actionForSwipe({
    phase,
    deltaX: event.clientX - startX,
    deltaY: event.clientY - startY,
  });
  resetSwipe(row, event.pointerId);
  if (action) wipe(itemId, action);
}

function cancelSwipe(event: PointerEvent) {
  if (!activeSwipe || activeSwipe.pointerId !== event.pointerId) return;
  resetSwipe(activeSwipe.row, event.pointerId);
}

function resetSwipe(row: HTMLElement, pointerId: number) {
  row.releasePointerCapture(pointerId);
  row.style.transform = "";
  setSwipePreview(row, null);
  row.classList.remove("dragging");
  activeSwipe = null;
}

function setSwipePreview(row: HTMLElement, action: WipeAction | null) {
  row.classList.remove(
    "swipe-preview-commit",
    "swipe-preview-done",
    "swipe-preview-defer",
    "swipe-preview-kill",
  );
  if (action) row.classList.add(`swipe-preview-${action}`);
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
  const validation = validateNewCommit(text, log.items);
  if (!validation.ok) {
    flashHint(validation.message);
    return;
  }
  log = { ...log, items: [...log.items, makeItem(validation.text, log.day)] };
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
  log = resolveLogForPhase(log, phase);
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
