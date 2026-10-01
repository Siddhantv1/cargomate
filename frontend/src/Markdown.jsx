// A small, safe markdown renderer for model replies: paragraphs, **bold**, *italic*, `code`, bullet and numbered
// lists, and tables. It only ever builds React elements, never HTML strings, so uploaded text can't inject markup.
// Links, images and raw HTML are not supported and show up as plain text.
// ponytail: a subset on purpose. If replies need nested lists, headings or links, switch to react-markdown.
const INLINE =
  String.raw`\*\*(.+?)\*\*|` + "`([^`]+)`" + String.raw`|(?<![\w*])\*([^\s*][^*]*?)\*(?![\w*])`;

function inline(text) {
  const re = new RegExp(INLINE, "g"); // a fresh regex per call: this function recurses, and lastIndex is shared state
  const out = [];
  let last = 0;
  let key = 0;
  let m;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    if (m[1] !== undefined) out.push(<strong key={key++}>{inline(m[1])}</strong>);
    else if (m[2] !== undefined) out.push(<code key={key++}>{m[2]}</code>);
    else out.push(<em key={key++}>{inline(m[3])}</em>);
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

const ROW = /^\s*\|.*\|\s*$/;
const SEPARATOR = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/;
const BULLET = /^\s*[-*+]\s+(.*)$/;
const ORDERED = /^\s*\d+[.)]\s+(.*)$/;
const HEADING = /^#{1,6}\s+(.*)$/;
const cells = (line) =>
  line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());

export function parseBlocks(text) {
  const lines = (text || "").split("\n");
  const blocks = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;

    if (ROW.test(line) && SEPARATOR.test(lines[i + 1] ?? "")) {
      const head = cells(line);
      const rows = [];
      i += 2;
      while (i < lines.length && ROW.test(lines[i])) rows.push(cells(lines[i++]));
      i--;
      blocks.push({ type: "table", head, rows: rows.map((r) => head.map((_, c) => r[c] ?? "")) });
      continue;
    }

    const list = (type, m) => {
      const last = blocks[blocks.length - 1];
      if (last?.type === type) last.items.push(m[1]);
      else blocks.push({ type, items: [m[1]] });
    };
    let m;
    if ((m = BULLET.exec(line))) list("ul", m);
    else if ((m = ORDERED.exec(line))) list("ol", m);
    else if ((m = HEADING.exec(line))) blocks.push({ type: "p", text: `**${m[1]}**` });
    else blocks.push({ type: "p", text: line.trim() }); // each line is its own paragraph, as the model writes them
  }
  return blocks;
}

export default function Markdown({ text }) {
  return (
    <div className="md">
      {parseBlocks(text).map((b, i) => {
        if (b.type === "ul" || b.type === "ol") {
          const List = b.type;
          return (
            <List key={i}>
              {b.items.map((item, j) => (
                <li key={j}>{inline(item)}</li>
              ))}
            </List>
          );
        }
        if (b.type === "table") {
          return (
            <div className="md-table" key={i}>
              <table>
                <thead>
                  <tr>
                    {b.head.map((h, c) => (
                      <th key={c}>{inline(h)}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {b.rows.map((r, j) => (
                    <tr key={j}>
                      {r.map((cell, c) => (
                        <td key={c}>{inline(cell)}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        }
        return <p key={i}>{inline(b.text)}</p>;
      })}
    </div>
  );
}
