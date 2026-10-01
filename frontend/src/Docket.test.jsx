import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Docket from "./Docket.jsx";
import { answerFixture } from "./fixtures.js";

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
