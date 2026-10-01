async function call(path, opts) {
  let res;
  try {
    res = await fetch(path, opts);
  } catch {
    throw new Error("Can't reach the server. Check that the backend is running on port 8000.");
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(typeof body.detail === "string" ? body.detail : "Something went wrong. Try again.");
  }
  return body;
}

const admin = (token) => ({ "X-Admin-Token": token });

export const askChat = (message, history) =>
  call("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, history }),
  });

export const listDocs = (token) => call("/api/documents", { headers: admin(token) });

export const uploadDoc = (token, file, category, effectiveDate) => {
  const form = new FormData();
  form.append("file", file);
  form.append("category", category);
  form.append("effective_date", effectiveDate);
  return call("/api/documents", { method: "POST", headers: admin(token), body: form });
};

export const deleteDoc = (token, name) =>
  call(`/api/documents/${encodeURIComponent(name)}`, { method: "DELETE", headers: admin(token) });
