import { render, screen } from "@testing-library/react";
import Markdown, { parseBlocks } from "./Markdown.jsx";

const html = (text) => render(<Markdown text={text} />).container.querySelector(".md");

describe("Markdown inline", () => {
  it("renders **bold**, *italic* and `code`", () => {
    const md = html("Air is **85 to 110** per kg, *indicative*, code `6109 10`.");
    expect(md.querySelector("strong")).toHaveTextContent("85 to 110");
    expect(md.querySelector("em")).toHaveTextContent("indicative");
    expect(md.querySelector("code")).toHaveTextContent("6109 10");
    expect(md.textContent).toBe("Air is 85 to 110 per kg, indicative, code 6109 10.");
  });

  it("handles italic inside bold and several bold runs on one line", () => {
    const md = html("**a *b* c** and **d**");
    expect(md.querySelectorAll("strong")).toHaveLength(2);
    expect(md.querySelector("strong em")).toHaveTextContent("b");
  });

  it("leaves unmatched markers and maths alone", () => {
    expect(html("2 * 3 = 6 and **unclosed").textContent).toBe("2 * 3 = 6 and **unclosed");
    expect(html("snake*case*name and a*b").querySelector("em")).toBeNull();
  });
});

describe("Markdown blocks", () => {
  it("makes each line a paragraph, because the model separates sentences with single newlines", () => {
    expect(html("One.\nTwo.\n\nThree.").querySelectorAll("p")).toHaveLength(3);
  });

  it("renders bullets and numbered lists, grouping consecutive items", () => {
    const md = html("- a\n- **b**\n* c\n\n1. first\n2) second");
    expect(md.querySelectorAll("ul > li")).toHaveLength(3);
    expect(md.querySelectorAll("ol > li")).toHaveLength(2);
    expect(md.querySelector("ul strong")).toHaveTextContent("b");
  });

  it("renders a table with a header row and pads short rows", () => {
    const md = html("| Mode | Cost | Days |\n|---|---|---|\n| **Air** | 85 | 1-3 |\n| Sea | 3500 |");
    expect([...md.querySelectorAll("th")].map((t) => t.textContent)).toEqual(["Mode", "Cost", "Days"]);
    const rows = [...md.querySelectorAll("tbody tr")].map((r) => [...r.children].map((c) => c.textContent));
    expect(rows).toEqual([["Air", "85", "1-3"], ["Sea", "3500", ""]]);
    expect(md.querySelector("td strong")).toHaveTextContent("Air");
  });

  it("does not mistake a lone pipe line for a table", () => {
    expect(html("a | b | c").querySelector("table")).toBeNull();
    expect(parseBlocks("| a | b |\nnot a separator").map((b) => b.type)).toEqual(["p", "p"]);
  });

  it("shows a stray heading as bold text, not a heading element", () => {
    const md = html("## Summary\nbody");
    expect(md.querySelector("h1,h2,h3")).toBeNull();
    expect(md.querySelector("p strong")).toHaveTextContent("Summary");
  });

  it("copes with empty and missing text", () => {
    expect(html("").children).toHaveLength(0);
    expect(html(undefined).children).toHaveLength(0);
  });
});

describe("Markdown safety (document text is untrusted)", () => {
  it("shows raw HTML as text and creates no elements from it", () => {
    const md = html('<img src=x onerror="alert(1)"> and <script>alert(2)</script> <b>hi</b>');
    expect(md.querySelector("img, script, b")).toBeNull();
    expect(md.textContent).toContain("<script>alert(2)</script>");
  });

  it("never creates links or images, so an injected document can't plant a clickable URL", () => {
    const md = html("[click here](https://evil.example) and ![x](https://evil.example/p.png)");
    expect(md.querySelector("a, img")).toBeNull();
    expect(screen.queryByRole("link")).toBeNull();
    expect(md.textContent).toContain("https://evil.example");
  });

  it("doesn't let markers inside table cells or code break out of their element", () => {
    const md = html("| a |\n|---|\n| <i>x</i> **y** |");
    expect(md.querySelector("td i")).toBeNull();
    expect(md.querySelector("td strong")).toHaveTextContent("y");
  });
});
