// Past chats, kept in this browser's localStorage. Every call reads the stored list fresh, changes one
// conversation and writes it back, so a second tab can't overwrite the first tab's chats.
// ponytail: per browser and per device. Cross-device history needs logins and a server table.
const KEY = "cargomate.history.v1";
export const MAX_CONVERSATIONS = 50;

const valid = (c) =>
  c &&
  typeof c.id === "string" &&
  typeof c.title === "string" &&
  Number.isFinite(c.updatedAt) &&
  Array.isArray(c.exchanges) &&
  c.exchanges.length > 0 &&
  c.exchanges.every((e) => typeof e?.question === "string" && e.answer && typeof e.answer.sections === "object");

/** Newest first. Never throws: blocked storage, bad JSON and malformed entries all read as "no history". */
export function loadAll() {
  try {
    const list = JSON.parse(localStorage.getItem(KEY) || "[]");
    return Array.isArray(list) ? list.filter(valid).sort((a, b) => b.updatedAt - a.updatedAt) : [];
  } catch {
    return [];
  }
}

// On a full or blocked store, drop the oldest chat and retry. The list passed in has the newest first.
function persist(list) {
  for (let keep = list; ; keep = keep.slice(0, -1)) {
    try {
      localStorage.setItem(KEY, JSON.stringify(keep));
      return keep;
    } catch {
      if (keep.length <= 1) return keep; // can't store even one; the chat still works, it just isn't remembered
    }
  }
}

export function saveConversation(conv) {
  const others = loadAll().filter((c) => c.id !== conv.id);
  return persist([conv, ...others].slice(0, MAX_CONVERSATIONS));
}

export function deleteConversation(id) {
  return persist(loadAll().filter((c) => c.id !== id));
}

export const newId = () => crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;

export function titleFor(question) {
  const t = question.replace(/\s+/g, " ").trim();
  return t.length > 60 ? `${t.slice(0, 57)}…` : t;
}
