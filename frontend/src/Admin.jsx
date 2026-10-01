import { useState } from "react";
import { deleteDoc, listDocs, uploadDoc } from "./api.js";
import { CATEGORIES, categoryLabel, formatDate } from "./format.js";

const VERB = { created: "Added", updated: "Replaced", unchanged: "No change to" };
const today = () => new Date().toLocaleDateString("en-CA"); // YYYY-MM-DD in local time
const guessCategory = (name) => {
  const prefix = name.split("__")[0];
  return CATEGORIES.some((c) => c.value === prefix) ? prefix : null;
};

export default function Admin() {
  const [token, setToken] = useState("");
  const [docs, setDocs] = useState(null); // null = locked
  const [file, setFile] = useState(null);
  const [category, setCategory] = useState(CATEGORIES[0].value);
  const [date, setDate] = useState(today());
  const [note, setNote] = useState(null);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(null);

  const fail = (e) => setNote({ kind: "error", text: e.message });

  async function unlock(e) {
    e.preventDefault();
    setNote(null);
    try {
      setDocs(await listDocs(token));
    } catch (err) {
      fail(err);
    }
  }

  async function upload(e) {
    e.preventDefault();
    if (!file) return;
    setBusy(true);
    setNote(null);
    try {
      const r = await uploadDoc(token, file, category, date);
      setNote({ kind: "ok", text: `${VERB[r.status]} ${r.name} (${r.chunks} passages).` });
      setDocs(await listDocs(token));
      setFile(null);
      e.target.reset();
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  }

  async function remove(name) {
    setNote(null);
    try {
      await deleteDoc(token, name);
      setConfirming(null);
      setNote({ kind: "ok", text: `Removed ${name}.` });
      setDocs(await listDocs(token));
    } catch (err) {
      fail(err);
    }
  }

  return (
    <div className="wrap admin">
      <h1 className="page-title">Knowledge base</h1>
      <p className="lede">
        Upload a document and the chatbot uses it straight away. A file with the same name replaces its earlier version.
        When two documents disagree, answers use the one with the later effective date.
      </p>

      {note && (
        <p className={`banner banner-${note.kind}`} role={note.kind === "error" ? "alert" : "status"}>
          {note.text}
        </p>
      )}

      {docs === null ? (
        <form className="panel" onSubmit={unlock}>
          <label className="field">
            <span>Admin token</span>
            <input type="password" autoComplete="off" value={token} onChange={(e) => setToken(e.target.value)} />
          </label>
          <button type="submit" disabled={!token}>
            Unlock
          </button>
        </form>
      ) : (
        <>
          <form className="panel panel-grid" onSubmit={upload}>
            <label className="field field-wide">
              <span>Document (PDF, Word, Excel, CSV, text)</span>
              <input
                type="file"
                accept=".pdf,.docx,.txt,.md,.csv,.xlsx"
                onChange={(e) => {
                  const f = e.target.files[0] ?? null;
                  setFile(f);
                  const guess = f && guessCategory(f.name);
                  if (guess) setCategory(guess);
                }}
              />
            </label>
            <label className="field">
              <span>Type of document</span>
              <select value={category} onChange={(e) => setCategory(e.target.value)}>
                {CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Effective date</span>
              <input type="date" required value={date} onChange={(e) => setDate(e.target.value)} />
            </label>
            <button type="submit" disabled={!file || busy}>
              {busy ? "Uploading" : "Upload document"}
            </button>
          </form>

          {docs.length === 0 ? (
            <p className="empty">Nothing uploaded yet. Add a rate sheet, a notification or a checklist to get started.</p>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Document</th>
                    <th>Type</th>
                    <th>Effective</th>
                    <th>Passages</th>
                    <th>
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {docs.map((d) => (
                    <tr key={d.name}>
                      <td>
                        <strong>{d.name}</strong>
                      </td>
                      <td>{categoryLabel(d.category)}</td>
                      <td>{formatDate(d.effective_date)}</td>
                      <td>{d.n_chunks}</td>
                      <td className="actions">
                        {confirming === d.name ? (
                          <>
                            <button type="button" className="danger" onClick={() => remove(d.name)}>
                              Confirm remove
                            </button>
                            <button type="button" className="link" onClick={() => setConfirming(null)}>
                              Keep
                            </button>
                          </>
                        ) : (
                          <button type="button" className="link" onClick={() => setConfirming(d.name)}>
                            Remove
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
