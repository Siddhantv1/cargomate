import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Admin from "./Admin.jsx";
import * as api from "./api.js";

vi.mock("./api.js");

const DOC = { name: "freight__rates.csv", category: "freight", effective_date: "2026-01-01", n_chunks: 3, updated_at: "x" };

async function unlock(docs = [DOC]) {
  api.listDocs.mockResolvedValue(docs);
  await userEvent.type(screen.getByLabelText("Admin token"), "secret");
  await userEvent.click(screen.getByRole("button", { name: "Unlock" }));
  await screen.findByRole("button", { name: "Upload document" });
}

beforeEach(() => vi.resetAllMocks());

describe("Admin", () => {
  it("stays locked and shows the server's message on a wrong token", async () => {
    api.listDocs.mockRejectedValue(new Error("Wrong admin token."));
    render(<Admin />);
    await userEvent.type(screen.getByLabelText("Admin token"), "nope");
    await userEvent.click(screen.getByRole("button", { name: "Unlock" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Wrong admin token.");
    expect(screen.queryByRole("button", { name: "Upload document" })).toBeNull();
    expect(api.listDocs).toHaveBeenCalledWith("nope");
  });

  it("lists documents with type, effective date and passage count after unlocking", async () => {
    render(<Admin />);
    await unlock();
    const row = screen.getByRole("row", { name: /freight__rates.csv/ });
    expect(within(row).getByText("Freight rates")).toBeInTheDocument();
    expect(within(row).getByText("1 Jan 2026")).toBeInTheDocument();
    expect(within(row).getByText("3")).toBeInTheDocument();
  });

  it("invites the first upload when the knowledge base is empty", async () => {
    render(<Admin />);
    await unlock([]);
    expect(screen.getByText(/Nothing uploaded yet/)).toBeInTheDocument();
  });

  it("disables upload until a file is chosen", async () => {
    render(<Admin />);
    await unlock();
    expect(screen.getByRole("button", { name: "Upload document" })).toBeDisabled();
  });

  it("uploads with the chosen type and date, reports a replacement, and refreshes the list", async () => {
    api.uploadDoc.mockResolvedValue({ name: "rates.csv", status: "updated", chunks: 7 });
    render(<Admin />);
    await unlock();
    const file = new File(["a,b\n1,2"], "rates.csv", { type: "text/csv" });
    await userEvent.upload(screen.getByLabelText(/Document \(PDF/), file);
    await userEvent.selectOptions(screen.getByLabelText("Type of document"), "port");
    const date = screen.getByLabelText("Effective date");
    await userEvent.clear(date);
    await userEvent.type(date, "2026-07-15");
    await userEvent.click(screen.getByRole("button", { name: "Upload document" }));
    expect(api.uploadDoc).toHaveBeenCalledWith("secret", file, "port", "2026-07-15");
    expect(await screen.findByRole("status")).toHaveTextContent("Replaced rates.csv (7 passages).");
    expect(api.listDocs).toHaveBeenCalledTimes(2);
  });

  it("preselects the type from a file name prefix such as freight__", async () => {
    render(<Admin />);
    await unlock();
    await userEvent.upload(screen.getByLabelText(/Document \(PDF/), new File(["x"], "dgft__notice.md"));
    expect(screen.getByLabelText("Type of document")).toHaveValue("dgft");
  });

  it("shows why an upload was rejected and keeps the list as it was", async () => {
    api.uploadDoc.mockRejectedValue(new Error("Unsupported file type. Use one of: .pdf, .docx."));
    render(<Admin />);
    await unlock();
    await userEvent.upload(screen.getByLabelText(/Document \(PDF/), new File(["x"], "a.txt"));
    await userEvent.click(screen.getByRole("button", { name: "Upload document" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Unsupported file type");
    expect(api.listDocs).toHaveBeenCalledTimes(1);
  });

  it("asks for confirmation before removing, and can be cancelled", async () => {
    render(<Admin />);
    await unlock();
    await userEvent.click(screen.getByRole("button", { name: "Remove" }));
    await userEvent.click(screen.getByRole("button", { name: "Keep" }));
    expect(api.deleteDoc).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Remove" })).toBeInTheDocument();
  });

  it("shows the confirmation as a bubble next to the row's own Remove link, which stays put", async () => {
    render(<Admin />);
    await unlock();
    const remove = screen.getByRole("button", { name: "Remove" });
    expect(screen.queryByRole("group")).toBeNull();
    await userEvent.click(remove);
    const bubble = screen.getByRole("group", { name: "Remove freight__rates.csv?" });
    expect(bubble).toHaveClass("confirm");
    expect(remove).toBeInTheDocument();
    expect(remove).toHaveAttribute("aria-expanded", "true");
    expect(remove.closest("td")).toContainElement(bubble);
    await userEvent.click(screen.getByRole("button", { name: "Keep" }));
    expect(screen.queryByRole("group")).toBeNull();
  });

  it("removes a document after confirmation and refreshes", async () => {
    api.deleteDoc.mockResolvedValue({});
    render(<Admin />);
    await unlock();
    await userEvent.click(screen.getByRole("button", { name: "Remove" }));
    api.listDocs.mockResolvedValue([]);
    await userEvent.click(screen.getByRole("button", { name: "Confirm remove" }));
    expect(api.deleteDoc).toHaveBeenCalledWith("secret", "freight__rates.csv");
    expect(await screen.findByRole("status")).toHaveTextContent("Removed freight__rates.csv.");
    await waitFor(() => expect(screen.getByText(/Nothing uploaded yet/)).toBeInTheDocument());
  });
});
