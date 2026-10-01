import { askChat, deleteDoc, listDocs, uploadDoc } from "./api.js";

const reply = (status, body) => Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(body) });

beforeEach(() => {
  globalThis.fetch = vi.fn();
});

describe("api", () => {
  it("posts the question and history as JSON", async () => {
    fetch.mockReturnValue(reply(200, { ok: 1 }));
    await askChat("hi", [{ role: "user", content: "x" }]);
    const [url, opts] = fetch.mock.calls[0];
    expect(url).toBe("/api/chat");
    expect(JSON.parse(opts.body)).toEqual({ message: "hi", history: [{ role: "user", content: "x" }] });
  });

  it("sends the admin token header and multipart form on upload", async () => {
    fetch.mockReturnValue(reply(200, {}));
    const file = new File(["x"], "a.csv");
    await uploadDoc("tok", file, "port", "2026-01-01");
    const [, opts] = fetch.mock.calls[0];
    expect(opts.headers["X-Admin-Token"]).toBe("tok");
    expect(opts.body.get("category")).toBe("port");
    expect(opts.body.get("effective_date")).toBe("2026-01-01");
    expect(opts.body.get("file")).toBe(file);
  });

  it("encodes document names in the delete URL", async () => {
    fetch.mockReturnValue(reply(200, {}));
    await deleteDoc("tok", "my file #1.csv");
    expect(fetch.mock.calls[0][0]).toBe("/api/documents/my%20file%20%231.csv");
  });

  it("surfaces the server's detail message", async () => {
    fetch.mockReturnValue(reply(401, { detail: "Wrong admin token." }));
    await expect(listDocs("bad")).rejects.toThrow("Wrong admin token.");
  });

  it("falls back to a generic message for validation errors and non-JSON bodies", async () => {
    fetch.mockReturnValue(reply(422, { detail: [{ msg: "too long" }] }));
    await expect(askChat("x", [])).rejects.toThrow("Something went wrong. Try again.");
    fetch.mockReturnValue(Promise.resolve({ ok: false, status: 500, json: () => Promise.reject(new Error("html")) }));
    await expect(askChat("x", [])).rejects.toThrow("Something went wrong. Try again.");
  });

  it("explains a network failure in plain words", async () => {
    fetch.mockRejectedValue(new TypeError("Failed to fetch"));
    await expect(askChat("x", [])).rejects.toThrow("Can't reach the server");
  });
});
