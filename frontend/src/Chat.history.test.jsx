import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Chat from "./Chat.jsx";
import { answerFixture } from "./fixtures.js";
import * as api from "./api.js";
import { loadAll } from "./history.js";

vi.mock("./api.js");

const box = () => screen.getByLabelText("Your question");
const sidebar = () => screen.getByRole("complementary", { name: "Past chats" });
const ask = async (q) => {
  await userEvent.type(box(), `${q}{Enter}`);
  await screen.findAllByText("Sourced");
  await waitFor(() => expect(box()).toBeEnabled());
};
const answeredWith = (text) => {
  const a = answerFixture();
  a.sections.hs_code.content = text;
  return a;
};

beforeEach(() => {
  vi.resetAllMocks();
  api.askChat.mockResolvedValue(answerFixture());
});

describe("Chat history", () => {
  it("shows a placeholder when there are no past chats", () => {
    render(<Chat />);
    expect(within(sidebar()).getByText("Your past chats will appear here.")).toBeInTheDocument();
  });

  it("saves an answered chat and lists it by its first question, dated Today", async () => {
    render(<Chat />);
    await ask("HS code for cotton shirts to Dubai");
    const row = within(sidebar()).getByRole("button", { name: /^HS code for cotton shirts to Dubai/ });
    expect(row).toHaveAttribute("aria-current", "true");
    expect(within(row).getByText("Today")).toBeInTheDocument();
    expect(loadAll()).toHaveLength(1);
  });

  it("remembers chats after a reload and reopens them without asking the server again", async () => {
    const first = render(<Chat />);
    await ask("first question");
    first.unmount();
    api.askChat.mockClear();

    render(<Chat />);
    expect(screen.queryByRole("heading", { level: 2 })).toBeNull();
    await userEvent.click(within(sidebar()).getByRole("button", { name: /^first question/ }));
    expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent("first question");
    expect(screen.getByText("6109 10 for knitted cotton T-shirts.")).toBeInTheDocument();
    expect(screen.getAllByText("Sourced")).toHaveLength(3);
    expect(api.askChat).not.toHaveBeenCalled();
  });

  it("keeps sources readable in a reopened chat", async () => {
    const first = render(<Chat />);
    await ask("q");
    first.unmount();
    render(<Chat />);
    await userEvent.click(within(sidebar()).getByRole("button", { name: /^q/ }));
    await userEvent.click(screen.getAllByRole("button", { name: "dgft__schemes.md" })[0]);
    expect(screen.getByText("EPCG gives zero duty")).toBeInTheDocument();
  });

  it("starts a fresh chat with New chat and keeps the old one in the list", async () => {
    render(<Chat />);
    await ask("old question");
    await userEvent.click(within(sidebar()).getByRole("button", { name: "New chat" }));
    expect(screen.getByText(/What are you shipping/)).toBeInTheDocument();
    expect(screen.queryByRole("heading", { level: 2 })).toBeNull();
    expect(box()).toHaveFocus();
    expect(within(sidebar()).getByRole("button", { name: /^old question/ })).not.toHaveAttribute("aria-current");

    api.askChat.mockClear();
    await ask("brand new question");
    expect(api.askChat).toHaveBeenCalledWith("brand new question", []); // nothing from the old chat leaks in
    expect(loadAll().map((c) => c.title).sort()).toEqual(["brand new question", "old question"]);
  });

  it("continues an opened chat with its earlier turns as context, in the same list entry", async () => {
    render(<Chat />);
    await ask("first");
    await userEvent.click(within(sidebar()).getByRole("button", { name: "New chat" }));
    await userEvent.click(within(sidebar()).getByRole("button", { name: /^first/ }));
    api.askChat.mockClear();

    await userEvent.type(box(), "and by sea?{Enter}");
    await waitFor(() => expect(screen.getAllByRole("heading", { level: 2 })).toHaveLength(2));
    const [question, history] = api.askChat.mock.calls[0];
    expect(question).toBe("and by sea?");
    expect(history.map((m) => m.role)).toEqual(["user", "assistant"]);
    expect(history[0].content).toBe("first");

    await waitFor(() => expect(loadAll()[0].exchanges).toHaveLength(2));
    expect(loadAll()).toHaveLength(1);
  });

  it("lists the most recently active chat first", async () => {
    render(<Chat />);
    await ask("alpha");
    await userEvent.click(within(sidebar()).getByRole("button", { name: "New chat" }));
    await ask("beta");
    expect(within(sidebar()).getAllByRole("listitem").map((li) => li.textContent)[0]).toContain("beta");

    await userEvent.click(within(sidebar()).getByRole("button", { name: /^alpha/ }));
    await userEvent.type(box(), "alpha again{Enter}");
    await waitFor(() => expect(screen.getAllByRole("heading", { level: 2 })).toHaveLength(2));
    await waitFor(() => expect(within(sidebar()).getAllByRole("listitem")[0].textContent).toContain("alpha"));
  });

  it("does not save a question that failed", async () => {
    api.askChat.mockRejectedValueOnce(new Error("The assistant could not produce an answer. Please try again."));
    render(<Chat />);
    await userEvent.type(box(), "will fail{Enter}");
    await screen.findByRole("alert");
    expect(loadAll()).toEqual([]);
    expect(within(sidebar()).getByText("Your past chats will appear here.")).toBeInTheDocument();
  });

  it("saves only the answered turns when an earlier one failed, titled by the first answered question", async () => {
    api.askChat.mockRejectedValueOnce(new Error("boom"));
    render(<Chat />);
    await userEvent.type(box(), "fails first{Enter}");
    await screen.findByRole("alert");
    await waitFor(() => expect(box()).toBeEnabled());
    await userEvent.type(box(), "works second{Enter}");
    await screen.findAllByText("Sourced");
    await waitFor(() => expect(loadAll()).toHaveLength(1));
    expect(loadAll()[0].title).toBe("works second");
    expect(loadAll()[0].exchanges.map((e) => e.question)).toEqual(["works second"]);
  });

  it("locks the sidebar while an answer is on its way, so it can't land in the wrong chat", async () => {
    render(<Chat />);
    await ask("one");
    let resolve;
    api.askChat.mockReturnValue(new Promise((r) => (resolve = r)));
    await userEvent.type(box(), "slow one{Enter}");
    expect(within(sidebar()).getByRole("button", { name: "New chat" })).toBeDisabled();
    expect(within(sidebar()).getByRole("button", { name: /^one/ })).toBeDisabled();
    resolve(answeredWith("done"));
    await waitFor(() => expect(within(sidebar()).getByRole("button", { name: "New chat" })).toBeEnabled());
  });

  it("deletes a chat only after confirmation, and Keep cancels", async () => {
    render(<Chat />);
    await ask("keep me");
    await userEvent.click(within(sidebar()).getByRole("button", { name: /Delete chat: keep me/ }));
    await userEvent.click(within(sidebar()).getByRole("button", { name: "Keep" }));
    expect(loadAll()).toHaveLength(1);

    await userEvent.click(within(sidebar()).getByRole("button", { name: /Delete chat: keep me/ }));
    await userEvent.click(within(sidebar()).getByRole("button", { name: "Confirm delete" }));
    expect(loadAll()).toEqual([]);
    expect(within(sidebar()).getByText("Your past chats will appear here.")).toBeInTheDocument();
  });

  it("returns to the start screen when the chat being viewed is deleted", async () => {
    render(<Chat />);
    await ask("viewing");
    await userEvent.click(within(sidebar()).getByRole("button", { name: /Delete chat/ }));
    await userEvent.click(within(sidebar()).getByRole("button", { name: "Confirm delete" }));
    expect(screen.getByText(/What are you shipping/)).toBeInTheDocument();
    expect(screen.queryByRole("heading", { level: 2 })).toBeNull();
  });

  it("deleting a different chat leaves the one on screen alone", async () => {
    render(<Chat />);
    await ask("other");
    await userEvent.click(within(sidebar()).getByRole("button", { name: "New chat" }));
    await ask("on screen");
    await userEvent.click(within(sidebar()).getByRole("button", { name: /Delete chat: other/ }));
    await userEvent.click(within(sidebar()).getByRole("button", { name: "Confirm delete" }));
    expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent("on screen");
    expect(loadAll().map((c) => c.title)).toEqual(["on screen"]);
  });

  it("works with storage blocked: chatting still works, nothing is remembered", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    render(<Chat />);
    await ask("still works");
    expect(screen.getByText("6109 10 for knitted cotton T-shirts.")).toBeInTheDocument();
    vi.restoreAllMocks();
  });

  it("starts with the sidebar open on a wide screen, folds it with the toggle, and keeps it open when a chat is picked", async () => {
    render(<Chat />);
    await ask("something");
    const toggle = screen.getByRole("button", { name: "Past chats (1)" });
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(sidebar()).toHaveClass("history-open");
    await userEvent.click(within(sidebar()).getByRole("button", { name: /^something/ }));
    expect(sidebar()).toHaveClass("history-open");
    await userEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(sidebar()).not.toHaveClass("history-open");
    await userEvent.click(toggle);
    expect(sidebar()).toHaveClass("history-open");
  });

  describe("on a phone", () => {
    beforeEach(() => {
      window.matchMedia = vi.fn().mockReturnValue({ matches: true });
    });
    afterEach(() => {
      delete window.matchMedia;
    });

    it("starts with the drawer shut, opens it from the toggle, and shuts it again when a chat is picked", async () => {
      render(<Chat />);
      const toggle = screen.getByRole("button", { name: "Past chats" });
      expect(toggle).toHaveAttribute("aria-expanded", "false");
      expect(sidebar()).not.toHaveClass("history-open");
      await ask("something");
      await userEvent.click(screen.getByRole("button", { name: "Past chats (1)" }));
      expect(toggle).toHaveAttribute("aria-expanded", "true");
      expect(sidebar()).toHaveClass("history-open");
      await userEvent.click(within(sidebar()).getByRole("button", { name: /^something/ }));
      expect(sidebar()).not.toHaveClass("history-open");
    });

    it("shuts the drawer when New chat is chosen", async () => {
      render(<Chat />);
      await userEvent.click(screen.getByRole("button", { name: "Past chats" }));
      await userEvent.click(within(sidebar()).getByRole("button", { name: "New chat" }));
      expect(sidebar()).not.toHaveClass("history-open");
    });
  });
});
