import { describe, expect, it } from "vitest";
import stringWidth from "string-width";
import stripAnsiCodes from "strip-ansi";
import { render, strip } from "../src/index.ts";

const noColor = { color: false, hyperlinks: false, wrap: true, width: 40 };
const ESC = "\u001B";
const BEL = "\u0007";
const ST = `${ESC}\\`;
const ITALIC_ON = `${ESC}[3m`;
const ITALIC_OFF = `${ESC}[23m`;

function expectLinesWithinWidth(output: string, width: number) {
  for (const line of output.trimEnd().split("\n")) {
    expect(stringWidth(line)).toBeLessThanOrEqual(width);
  }
}

function lineContaining(output: string, text: string): string {
  return output.split("\n").find((line) => line.includes(text)) ?? "";
}

function tableColumnText(output: string, column: number): string {
  return output
    .split("\n")
    .filter((line) => line.startsWith("│"))
    .map((line) => line.split("│")[column]?.trim() ?? "")
    .join("");
}

function tableColumnWidths(output: string): number[] {
  const topBorder = output.split("\n").find((line) => line.startsWith("┌")) ?? "";
  return topBorder
    .slice(1, -1)
    .split("┬")
    .map((segment) => stringWidth(segment));
}

function occurrences(text: string, needle: string): number {
  return text.split(needle).length - 1;
}

describe("tables", () => {
  it("does not linkify underscores inside tables", () => {
    const md = `
| Filename | Size |
| --- | --- |
| icon_16x16.png | 16 |
| icon_16x16@2x.png | 32 |
`;
    const out = strip(md, { ...noColor, wrap: true, tableTruncate: false });
    const lines = out.split("\n").filter((l) => l.includes("icon_16x16"));
    lines.forEach((line) => {
      expect(line).not.toMatch(/https?:/);
      expect(line).toContain("icon_16x16");
    });
  });

  it("respects inline links in table cells but keeps other cells plain", () => {
    const md = `
| File | Link |
| --- | --- |
| icon_16x16.png | https://example.com/icon.png |
`;
    const out = strip(md, {
      ...noColor,
      wrap: true,
      hyperlinks: false,
      tableTruncate: false,
      width: 60,
    });
    expect(out).toContain("icon_16x16.png");
    expect(out).toContain("https://example.com/icon.png");
  });

  it("keeps mailto-style autolinks plain inside tables", () => {
    const md = `
| File | Size |
| --- | --- |
| icon_16x16@2x.png | 32 |
`;
    const out = strip(md, {
      ...noColor,
      wrap: true,
      hyperlinks: true,
      tableTruncate: false,
      width: 40,
    });
    // Should render as plain text, not OSC-8 or styled link
    expect(out).toContain("icon_16x16@2x.png");
    expect(out).not.toContain("\u001B]8;;"); // no OSC hyperlink
  });

  it("renders ascii and no-border tables with padding/dense options", () => {
    const md = `
| h1 | h2 |
| --- | --- |
| a | b |
`;
    const ascii = strip(md, {
      ...noColor,
      tableBorder: "ascii",
      tablePadding: 2,
    });
    expect(ascii).toContain("+");
    expect(ascii).toContain("h1");
    expect(ascii).toContain("a");

    const none = strip(md, {
      ...noColor,
      tableBorder: "none",
      tableDense: true,
      tablePadding: 0,
    });
    expect(none).toContain("h1");
    expect(none).toContain("b");
  });

  it("renders gfm tables", () => {
    const md = `
| h1 | h2 |
| --- | --- |
| a | b |
`;
    const out = strip(md, { ...noColor, width: 30 });
    expect(out).toMatch(/h1/);
    expect(out).toMatch(/h2/);
  });

  it("wraps table cells on spaces when width is small", () => {
    const md = `
| h1 | h2 |
| --- | --- |
| a b c d e f | g |
`;
    const out = strip(md, {
      ...noColor,
      width: 15,
      wrap: true,
      tableTruncate: false,
    });
    const bodyLines = out
      .trim()
      .split("\n")
      .filter((line) => line.startsWith("│") && !line.includes("h1"));
    expect(bodyLines.length).toBeGreaterThan(1);
  });

  it("wraps cells without shifting columns into separate rows", () => {
    const md = `
| h1 | h2 |
| --- | --- |
| a b c d e f | g |
`;
    const out = strip(md, {
      ...noColor,
      width: 15,
      wrap: true,
      tableTruncate: false,
    });
    const bodyLines = out
      .split("\n")
      .map((l) => l.trimEnd())
      .filter((l) => l.includes("│"))
      .filter((l) => l.includes("g"));
    expect(bodyLines.length).toBeGreaterThan(0);
    for (const line of bodyLines) {
      expect(line).toContain("a");
    }
  });

  it("keeps compact tables at their natural width", () => {
    const md = `
| key | value |
| --- | --- |
| a | b |
`;
    const out = strip(md, { ...noColor, width: 80, tableTruncate: false });

    expect(stringWidth(out.trimEnd().split("\n")[0] ?? "")).toBeLessThan(80);
    expect(tableColumnWidths(out)).toEqual([5, 7]);
  });

  it("gives unused terminal width to an oversized content column", () => {
    const md = `
| key | description |
| --- | --- |
| a | ${"longcontent".repeat(12)} |
`;
    const out = strip(md, { ...noColor, width: 60, tableTruncate: false });

    expect(stringWidth(out.trimEnd().split("\n")[0] ?? "")).toBe(60);
    expect(tableColumnWidths(out)).toEqual([5, 52]);
    expectLinesWithinWidth(out, 60);
  });

  it("shares constrained width fairly between multiple long columns", () => {
    const md = `
| left | right |
| --- | --- |
| ${"leftvalue".repeat(10)} | ${"rightvalue".repeat(10)} |
`;
    const out = strip(md, { ...noColor, width: 60, tableTruncate: false });
    const widths = tableColumnWidths(out);

    expect(widths.reduce((total, width) => total + width, 0) + 3).toBe(60);
    expect(Math.abs((widths[0] ?? 0) - (widths[1] ?? 0))).toBeLessThanOrEqual(1);
    expectLinesWithinWidth(out, 60);
  });

  it("does not let one long column force short columns to grow", () => {
    const md = `
| notes | status |
| --- | --- |
| short | ok |
| short | ok |
| ${"exceptionallylongvalue".repeat(6)} | ok |
`;
    const out = strip(md, { ...noColor, width: 50, tableTruncate: false });
    const widths = tableColumnWidths(out);

    expect(widths).toEqual([39, 8]);
    expectLinesWithinWidth(out, 50);
  });

  it("reclaims space left unused after wrapping at word boundaries", () => {
    const md = `
| words | identifier |
| --- | --- |
| sometest sometest | ${"identifier".repeat(8)} |
`;
    const out = strip(md, { ...noColor, width: 30, tableTruncate: false });

    expect(tableColumnWidths(out)).toEqual([10, 17]);
    expectLinesWithinWidth(out, 30);
  });

  it("does not truncate header cells when content fits", () => {
    const md = `
| Provider | Enabled | Configured | Detail |
| --- | --- | --- | --- |
| WhatsApp | ON | WARN | not linked |
`;
    const out = strip(md, { ...noColor, width: 120, wrap: true });
    expect(out).toContain("Provider");
    expect(out).not.toContain("Provi…");
  });

  it("hard-wraps long words in cells when truncation is disabled", () => {
    const word = "Supercalifragilistic";
    const md = `
| h1 | h2 |
| --- | --- |
| ${word} | x |
`;
    const out = strip(md, {
      ...noColor,
      width: 15,
      wrap: true,
      tableTruncate: false,
    });

    expect(tableColumnText(out, 1)).toContain(word);
    expectLinesWithinWidth(out, 15);
  });

  it("hard-wraps long identifiers without shifting table borders", () => {
    const identifier = "buildRuntimeRecoveryPlan、createRuntimeFromAdapter";
    const md = `
| 难度 | 切入点 | 具体建议 |
| --- | --- | --- |
| 简单 | 增加注释 | ${identifier} |
`;
    const out = strip(md, {
      ...noColor,
      width: 40,
      wrap: true,
      tableTruncate: false,
    });

    expect(tableColumnText(out, 3)).toContain(identifier);
    expectLinesWithinWidth(out, 40);
  });

  it("closes inline code color before wrapped table borders", () => {
    const md = `
| 问题 | 具体表现 |
| --- | --- |
| 安全漏洞 | 没有命令过滤，包括 \`rm -rf /\`、\`format C:\` 等操作 |
`;
    const out = render(md, {
      color: true,
      hyperlinks: false,
      width: 45,
      wrap: true,
      tableTruncate: false,
    });
    const bodyLines = out
      .split("\n")
      .filter((line) => line.startsWith("│") && !line.includes("问题"));

    expect(bodyLines.length).toBeGreaterThan(1);
    for (const line of bodyLines) {
      const borderIndex = line.lastIndexOf("│");
      const colorIndex = line.lastIndexOf("\u001B[36m", borderIndex);
      if (colorIndex !== -1) {
        expect(line.lastIndexOf("\u001B[39m", borderIndex)).toBeGreaterThan(colorIndex);
      }
    }
  });

  it("wraps long CJK cells when truncation is disabled", () => {
    const text = "这是一段没有空格的超长中文单元格内容用来验证表格边框不会被撑破并且内容不会丢失";
    const md = `
| item | description |
| --- | --- |
| long | ${text} |
`;
    const out = strip(md, {
      ...noColor,
      width: 40,
      wrap: true,
      tableTruncate: false,
    });

    expect(out).toContain("丢失");
    expect(out).not.toContain("…");
    expectLinesWithinWidth(out, 40);
  });

  it("respects table alignment markers from GFM", () => {
    const md = `
| h1 | h2 |
| :-- | --: |
| left | right |
`;
    const out = strip(md, {
      ...noColor,
      width: 30,
      wrap: true,
      tableTruncate: false,
    });
    const lines = out
      .trim()
      .split("\n")
      .filter((l) => l.includes("│") || l.includes("|"));
    expect(lines.some((l) => /left/.test(l) && /right/.test(l))).toBe(true);
  });

  it("truncates cells by default when width is tight", () => {
    const md = `
| col | col2 |
| --- | --- |
| Supercalifragilistic | short |
`;
    const out = strip(md, { ...noColor, width: 18, wrap: true });
    expect(out).toContain("…");
  });

  it("closes ANSI styling when truncating a styled cell", () => {
    const md = "| Col |\n|---|\n| *averylongemphasizedwordthatexceedscol* |\n";
    const out = render(md, { color: true, hyperlinks: false, wrap: true, width: 30 });
    const row = lineContaining(out, "avery");
    const open = row.indexOf(ITALIC_ON);
    expect(open).toBeGreaterThanOrEqual(0);
    expect(row.indexOf(ITALIC_OFF, open)).toBeGreaterThan(open);
    expect(row).toContain("…");
    expectLinesWithinWidth(out, 30);
  });

  it("preserves OSC-8 hyperlinks when truncating linked cells", () => {
    const url = "https://example.com/docs/very-long-target";
    const md = `| Link |\n|---|\n| [averylonglinklabelthatexceeds](${url}) |\n`;
    const out = render(md, { color: true, hyperlinks: true, wrap: true, width: 24 });
    const row = lineContaining(out, "avery");
    const open = `${ESC}]8;;${url}${BEL}`;
    const close = `${ESC}]8;;${BEL}`;
    expect(occurrences(row, open)).toBe(1);
    expect(occurrences(row, close)).toBe(1);
    expect(row.indexOf(close)).toBeGreaterThan(row.indexOf(open));
    expect(row).toContain("…");
    expectLinesWithinWidth(out, 24);
  });

  it("preserves ST-terminated OSC-8 hyperlinks when truncating cells", () => {
    const open = `${ESC}]8;;example-link${ST}`;
    const close = `${ESC}]8;;${ST}`;
    const md = `| Link |\n|---|\n| ${open}averylonglinklabelthatexceeds${close} |\n`;
    const out = render(md, { color: true, hyperlinks: false, wrap: true, width: 24 });
    const row = lineContaining(out, "avery");
    expect(occurrences(row, open)).toBe(1);
    expect(occurrences(row, close)).toBe(1);
    expect(row.indexOf(close)).toBeGreaterThan(row.indexOf(open));
    expect(row).toContain("…");
    expectLinesWithinWidth(out, 24);
  });

  it("keeps CJK and emoji cells within visible table width", () => {
    const cjk = strip("| Col |\n|---|\n| 漢字漢字漢字漢字漢字漢字漢字漢字 |\n", {
      ...noColor,
      width: 12,
      tablePadding: 0,
    });
    expect(cjk).toContain("…");
    expectLinesWithinWidth(cjk, 12);

    const kana = strip("| Kana |\n|---|\n| カﾞカﾞカﾞカﾞ |\n", {
      ...noColor,
      width: 10,
      tablePadding: 0,
    });
    expect(kana).toContain("…");
    expectLinesWithinWidth(kana, 10);

    const flag = "🇺🇸";
    const emoji = strip(`| Emoji |\n|---|\n| ${flag.repeat(8)} done |\n`, {
      ...noColor,
      width: 12,
      tablePadding: 0,
    });
    const row = lineContaining(emoji, "…");
    const cell = (stripAnsiCodes(row).split("│")[1] ?? "").trim();
    const beforeEllipsis = cell.split("…")[0] ?? "";
    const regionalIndicators = [...beforeEllipsis].filter((char) => {
      const codePoint = char.codePointAt(0) ?? 0;
      return codePoint >= 0x1f1e6 && codePoint <= 0x1f1ff;
    }).length;
    expect(beforeEllipsis).toContain(flag);
    expect(regionalIndicators % 2).toBe(0);
    expectLinesWithinWidth(emoji, 12);
  });

  it("balances nested styling inside OSC-8 links when truncating cells", () => {
    const url = "https://example.com/nested";
    const md = `| Link |\n|---|\n| [*averylongemphasizedlinklabelthatexceeds*](${url}) |\n`;
    const out = render(md, { color: true, hyperlinks: true, wrap: true, width: 28 });
    const row = lineContaining(out, "avery");
    const openLink = `${ESC}]8;;${url}${BEL}`;
    const closeLink = `${ESC}]8;;${BEL}`;
    expect(occurrences(row, openLink)).toBe(1);
    expect(occurrences(row, closeLink)).toBe(1);
    expect(row).toContain(ITALIC_ON);
    expect(row).toContain(ITALIC_OFF);
    expect(row).toContain("…");
    expectLinesWithinWidth(out, 28);
  });

  it("keeps at least ellipsis when width extremely small", () => {
    const md = `
| h |
| - |
| verylong |
`;
    const out = strip(md, {
      ...noColor,
      width: 4,
      wrap: true,
      tablePadding: 0,
    });
    expect(out).toMatch(/…/);
  });

  it("aligns left/center/right cells", () => {
    const md = `
| l | c | r |
| :-- | :-: | --: |
| a | b | c |
`;
    const out = strip(md, { ...noColor, width: 40, wrap: true });
    const line = out.split("\n").find((l) => l.includes("a") && l.includes("c"));
    expect(line).toBeDefined();
    expect(line?.includes(" c ")).toBe(true);
  });
});
