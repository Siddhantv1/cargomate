import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Chat from "./Chat.jsx";
import { answerFixture, chatFixture } from "./fixtures.js";
import * as api from "./api.js";

vi.mock("./api.js");

const box = () => screen.getByLabelText("Your question");

beforeEach(() => vi.resetAllMocks());

describe("Chat", () => {
  it("offers the four example enquiries and asks one when clicked", async () => {
    api.askChat.mockResolvedValue(answerFixture());
    render(<Chat />);
    expect(screen.getAllByRole("listitem")).toHaveLength(4);
    await userEvent.click(screen.getByRole("button", { name: "DGFT incentive on EPCG for HS 6109?" }));
    expect(api.askChat).toHaveBeenCalledWith("DGFT incentive on EPCG for HS 6109?", []);
    expect(await screen.findAllByText("Sourced")).toHaveLength(3);
    expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent("DGFT incentive on EPCG for HS 6109?");
    expect(screen.queryByText(/What are you shipping/)).toBeNull();
  });

  it("sends on Enter, keeps a newline on Shift+Enter, and ignores blank input", async () => {
    api.askChat.mockResolvedValue(answerFixture());
    render(<Chat />);
    expect(screen.getByRole("button", { name: "Ask" })).toBeDisabled();
    await userEvent.type(box(), "   {Enter}");
    expect(api.askChat).not.toHaveBeenCalled();
    await userEvent.type(box(), "line one{Shift>}{Enter}{/Shift}line two");
    expect(api.askChat).not.toHaveBeenCalled();
    expect(box()).toHaveValue("   line one\nline two");
    await userEvent.type(box(), "{Enter}");
    expect(api.askChat).toHaveBeenCalledWith("line one\nline two", []);
    await waitFor(() => expect(box()).toHaveValue(""));
  });

  it("shows a working state, blocks double-sending, then the docket", async () => {
    let resolve;
    api.askChat.mockReturnValue(new Promise((r) => (resolve = r)));
    render(<Chat />);
    await userEvent.type(box(), "hs code{Enter}");
    expect(screen.getByText("Checking the documents")).toBeInTheDocument();
    await userEvent.type(box(), "another{Enter}");
    expect(api.askChat).toHaveBeenCalledTimes(1);
    resolve(answerFixture());
    expect(await screen.findByText("6109 10 for knitted cotton T-shirts.")).toBeInTheDocument();
    expect(screen.queryByText("Checking the documents")).toBeNull();
  });

  it("carries earlier turns as history so follow-ups have context", async () => {
    api.askChat.mockResolvedValue(answerFixture());
    render(<Chat />);
    await userEvent.type(box(), "first question{Enter}");
    await screen.findByText("6109 10 for knitted cotton T-shirts.");
    await userEvent.type(box(), "and by sea?{Enter}");
    const [question, history] = api.askChat.mock.calls[1];
    expect(question).toBe("and by sea?");
    expect(history.map((m) => m.role)).toEqual(["user", "assistant"]);
    expect(history[0].content).toBe("first question");
  });

  it("shows the server's message when asking fails, and lets the user try again", async () => {
    api.askChat.mockRejectedValueOnce(new Error("The assistant could not produce an answer. Please try again."));
    api.askChat.mockResolvedValueOnce(answerFixture());
    render(<Chat />);
    await userEvent.type(box(), "hs code{Enter}");
    expect(await screen.findByRole("alert")).toHaveTextContent("could not produce an answer");
    await waitFor(() => expect(screen.getByLabelText("Your question")).toBeEnabled());
    await userEvent.type(box(), "hs code again{Enter}");
    expect(await screen.findByText("6109 10 for knitted cotton T-shirts.")).toBeInTheDocument();
    // the failed turn must not be sent back as history
    expect(api.askChat.mock.calls[1][1]).toEqual([]);
  });

  it("shows the follow-up question when the assistant needs one more detail", async () => {
    api.askChat.mockResolvedValue(answerFixture({ follow_up_question: "Is the fabric knitted or woven?" }));
    render(<Chat />);
    await userEvent.type(box(), "hs code for shirts{Enter}");
    expect(await screen.findByText(/Is the fabric knitted or woven\?/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Reply" }));
    expect(box()).toHaveFocus();
  });
});

describe("Chat: dynamic replies", () => {
  it("answers a follow-up as a chat reply and an analysis question as a docket, in one thread", async () => {
    api.askChat.mockResolvedValueOnce(answerFixture());
    api.askChat.mockResolvedValueOnce(chatFixture("By **sea** it takes 14 to 20 days."));
    const { container } = render(<Chat />);
    await userEvent.type(box(), "hs code for cotton shirts{Enter}");
    await screen.findByRole("heading", { name: "HS code" });
    await waitFor(() => expect(box()).toBeEnabled());
    await userEvent.type(box(), "what about sea?{Enter}");
    await waitFor(() => expect(container.querySelector(".reply")).not.toBeNull());
    expect(container.querySelectorAll(".docket")).toHaveLength(1);
    const [analysis, followUp] = container.querySelectorAll(".exchange");
    expect(analysis).not.toHaveClass("exchange-chat");
    expect(followUp).toHaveClass("exchange-chat");
    expect(followUp.querySelector("strong")).toHaveTextContent("sea");
  });

  it("feeds a chat reply back as context for the next question", async () => {
    api.askChat.mockResolvedValue(chatFixture("Sea takes 14 to 20 days."));
    render(<Chat />);
    await userEvent.type(box(), "sea transit?{Enter}");
    await screen.findByText(/Sea takes 14 to 20 days/);
    await waitFor(() => expect(box()).toBeEnabled());
    await userEvent.type(box(), "and air?{Enter}");
    const history = api.askChat.mock.calls[1][1];
    expect(history[1]).toEqual({ role: "assistant", content: "Answer: Sea takes 14 to 20 days." });
  });
});
