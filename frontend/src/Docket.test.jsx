import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Docket from "./Docket.jsx";
import { answerFixture, chatFixture } from "./fixtures.js";

describe("Docket", () => {
  it("stamps grounded sections Sourced and missing ones No data, and leaves irrelevant ones unstamped", () => {
    render(<Docket answer={answerFixture()} />);
    expect(screen.getAllByText("Sourced")).toHaveLength(3);
    expect(screen.getAllByText("No data")).toHaveLength(1);
    const unused = screen.getByRole("heading", { name: "Estimated benefit" }).closest("section");
    expect(within(unused).queryByText(/Sourced|No data/)).toBeNull();
    expect(within(unused).getByText("Not needed for this question.")).toBeInTheDocument();
  });

  it("renders every one of the six sections in the specified order", () => {
    render(<Docket answer={answerFixture()} />);
    const titles = screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent);
    expect(titles.slice(0, 6)).toEqual([
      "HS code",
      "DGFT schemes",
      "Incentive rates and caps",
      "Estimated benefit",
      "Compliance and documents",
      "Freight and port",
    ]);
  });

  it("renders bullet lines as a list", () => {
    render(<Docket answer={answerFixture()} />);
    const items = within(screen.getByRole("heading", { name: "Compliance and documents" }).closest("section")).getAllByRole("listitem");
    expect(items.map((i) => i.textContent)).toEqual(["Commercial invoice", "Packing list"]);
  });

  it("always shows the disclaimer", () => {
    render(<Docket answer={answerFixture()} />);
    expect(screen.getByText("Not legal, customs or financial advice.")).toBeInTheDocument();
  });

  it("opens the cited source's excerpt when its name is clicked, and closes it again", async () => {
    render(<Docket answer={answerFixture()} />);
    expect(screen.queryByText("6109 10 cotton T-shirts")).toBeNull();
    const hsCell = screen.getByRole("heading", { name: "HS code" }).closest("section");
    await userEvent.click(within(hsCell).getByRole("button", { name: "hs_code__textiles_sample.csv" }));
    expect(screen.getByText("6109 10 cotton T-shirts")).toBeInTheDocument();
    const row = screen.getAllByRole("button", { name: /hs_code__textiles_sample.csv/ }).find((b) => b.hasAttribute("aria-expanded"));
    expect(row).toHaveAttribute("aria-expanded", "true");
    await userEvent.click(row);
    expect(screen.queryByText("6109 10 cotton T-shirts")).toBeNull();
  });

  it("shows each source's type and effective date", () => {
    render(<Docket answer={answerFixture()} />);
    expect(screen.getByText("DGFT schemes and rates, effective 1 Apr 2026")).toBeInTheDocument();
  });

  it("omits the sources panel when nothing was cited", () => {
    render(<Docket answer={answerFixture({ sources: [] })} />);
    expect(screen.queryByRole("heading", { name: "Sources" })).toBeNull();
  });
});

describe("Docket: dynamic shape", () => {
  it("shows a follow-up as a plain chat reply with no form around it", () => {
    const { container } = render(<Docket answer={chatFixture("Sea takes **14 to 20** days.")} />);
    expect(container.querySelector(".reply")).not.toBeNull();
    expect(container.querySelector(".docket, .docket-grid, .cell")).toBeNull();
    expect(screen.queryByRole("heading", { name: "HS code" })).toBeNull();
    expect(container.querySelector(".reply strong")).toHaveTextContent("14 to 20");
    expect(screen.queryByText("Sourced")).toBeNull(); // stamps belong to the docket
  });

  it("keeps sources, citations and the disclaimer on a chat reply", async () => {
    render(<Docket answer={chatFixture("Sea takes 14 days.")} />);
    expect(screen.getByText("Not legal, customs or financial advice.")).toBeInTheDocument();
    await userEvent.click(screen.getAllByRole("button", { name: "hs_code__textiles_sample.csv" })[0]);
    expect(screen.getByText("6109 10 cotton T-shirts")).toBeInTheDocument();
  });

  it("marks a chat reply the documents can't support, in words", () => {
    const a = chatFixture("The documents don't cover this.", { answer: { status: "no_data", content: "The documents don't cover this.", citations: [] }, sources: [] });
    render(<Docket answer={a} />);
    expect(screen.getByText("Not in the documents")).toBeInTheDocument();
    expect(screen.getByText("The documents don't cover this.")).toBeInTheDocument();
  });

  it("puts the lead answer at the top of the docket when sections apply too", () => {
    const a = answerFixture({ answer: { status: "ok", content: "Bottom line: use **air**.", citations: ["S1"] } });
    const { container } = render(<Docket answer={a} />);
    expect(container.querySelector(".docket > .lead")).toHaveTextContent("Bottom line: use air.");
    expect(container.querySelector(".lead strong")).toHaveTextContent("air");
    expect(container.querySelector(".lead + .docket-grid")).not.toBeNull();
    expect(screen.getByRole("heading", { name: "HS code" })).toBeInTheDocument();
  });

  it("omits the lead block when the answer field isn't used", () => {
    const { container } = render(<Docket answer={answerFixture()} />);
    expect(container.querySelector(".lead")).toBeNull();
  });

  it("still renders a chat saved before the lead answer existed", () => {
    const saved = answerFixture();
    delete saved.answer;
    const { container } = render(<Docket answer={saved} />);
    expect(container.querySelector(".docket-grid")).not.toBeNull();
    const old = chatFixture();
    delete old.answer;
    render(<Docket answer={old} />); // nothing applies and no lead: must not crash
  });

  it("still renders an older all-no-data docket as a docket", () => {
    const a = answerFixture();
    for (const s of Object.values(a.sections)) Object.assign(s, { status: "no_data", content: "Not covered.", citations: [] });
    a.sources = [];
    render(<Docket answer={a} />);
    expect(screen.getAllByText("No data")).toHaveLength(6);
  });

  it("renders markdown inside docket cells: bold, lists and tables", () => {
    const a = answerFixture();
    a.sections.freight_and_port = { status: "ok", citations: ["S1"], content: "Air is **85 to 110** per kg.\n\n| Mode | Days |\n|---|---|\n| Air | 1-3 |\n| Sea | 14-20 |" };
    const { container } = render(<Docket answer={a} />);
    const cell = screen.getByRole("heading", { name: "Freight and port" }).closest("section");
    expect(within(cell).getByText("85 to 110").tagName).toBe("STRONG");
    expect(cell.querySelectorAll("tbody tr")).toHaveLength(2);
    expect(container.querySelector("a, img")).toBeNull();
  });
});
