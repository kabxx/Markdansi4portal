import stringWidth from "string-width";
import stripAnsi from "strip-ansi";
import sliceAnsi from "slice-ansi";

/**
 * Visible width of a string, ignoring ANSI escape codes.
 */
export function visibleWidth(text: string): number {
  return stringWidth(stripAnsi(text));
}

/**
 * Wrap a single paragraph string into lines respecting visible width.
 * Breaks on spaces and CJK character boundaries. Long words overflow unless
 * hardWrapLongWords is enabled.
 */
export function wrapText(
  text: string,
  width: number,
  wrap: boolean,
  hardWrapLongWords = false,
): string[] {
  if (!wrap || width <= 0) return [text];
  const words = segmentWrapWords(text).flatMap((word) => {
    if (hardWrapLongWords && !/^\s+$/.test(word) && visibleWidth(word) > width) {
      return splitLongWord(word, width);
    }

    return [word];
  });
  const lines: string[] = [];
  let current = "";
  let currentWidth = 0;

  const trimEndSpaces = (s: string) => s.replace(/\s+$/, "");

  const orphanPhraseTail = (s: string): string | null => {
    const trimmed = trimEndSpaces(s);
    const phrase = trimmed.match(/\b(with|in|on|of|to|for)\s+(a|an|the)$/i);
    if (phrase) {
      const preposition = phrase[1];
      const article = phrase[2];
      if (preposition && article) return `${preposition} ${article}`;
    }

    const single = trimmed.match(/\b(a|an|the|to|of|with|and|or|in|on|for)$/i);
    return single?.[1] ?? null;
  };

  for (const word of words) {
    const w = visibleWidth(word);
    if (current !== "" && currentWidth + w > width && !/^\s+$/.test(word)) {
      const nextWord = word.replace(/^\s+/, "");
      const currentNoTrail = trimEndSpaces(current);
      const tail = orphanPhraseTail(currentNoTrail);
      if (tail && currentNoTrail.length > tail.length) {
        const base = trimEndSpaces(currentNoTrail.slice(0, currentNoTrail.length - tail.length));
        if (base !== "") {
          lines.push(base);
          current = `${tail} ${nextWord}`;
          currentWidth = visibleWidth(current);
          continue;
        }
      }

      lines.push(currentNoTrail);
      current = nextWord;
      currentWidth = visibleWidth(current);
      continue;
    }
    current += word;
    currentWidth = visibleWidth(current);
  }

  if (current !== "") lines.push(trimEndSpaces(current));
  if (lines.length === 0) lines.push("");
  return balanceAnsiStyles(lines);
}

type AnsiStyle =
  | "foreground"
  | "background"
  | "bold"
  | "dim"
  | "italic"
  | "underline"
  | "blink"
  | "inverse"
  | "hidden"
  | "strike";

const ANSI_STYLE_CLOSE: Record<AnsiStyle, string> = {
  foreground: "\u001B[39m",
  background: "\u001B[49m",
  bold: "\u001B[22m",
  dim: "\u001B[22m",
  italic: "\u001B[23m",
  underline: "\u001B[24m",
  blink: "\u001B[25m",
  inverse: "\u001B[27m",
  hidden: "\u001B[28m",
  strike: "\u001B[29m",
};

function balanceAnsiStyles(lines: string[]): string[] {
  const active = new Map<AnsiStyle, string>();

  return lines.map((line) => {
    const prefix = [...active.values()].join("");
    for (let index = 0; index < line.length; ) {
      const ansi = readAnsiSgr(line.slice(index));
      if (ansi) {
        updateAnsiStyles(active, ansi);
        index += ansi.length;
      } else {
        index += (line.codePointAt(index) ?? 0) > 0xffff ? 2 : 1;
      }
    }

    const suffix = [...active.keys()]
      .reverse()
      .map((style) => ANSI_STYLE_CLOSE[style])
      .join("");
    return `${prefix}${line}${suffix}`;
  });
}

function updateAnsiStyles(active: Map<AnsiStyle, string>, ansi: string) {
  const params = ansi
    .slice(2, -1)
    .split(";")
    .map((value) => (value === "" ? 0 : Number(value)));
  const codes = params.length > 0 ? params : [0];

  for (let index = 0; index < codes.length; index += 1) {
    const code = codes[index] ?? 0;
    if (code === 0) active.clear();
    else if (code === 1) active.set("bold", ansi);
    else if (code === 2) active.set("dim", ansi);
    else if (code === 3) active.set("italic", ansi);
    else if (code === 4) active.set("underline", ansi);
    else if (code === 5 || code === 6) active.set("blink", ansi);
    else if (code === 7) active.set("inverse", ansi);
    else if (code === 8) active.set("hidden", ansi);
    else if (code === 9) active.set("strike", ansi);
    else if (code === 22) {
      active.delete("bold");
      active.delete("dim");
    } else if (code === 23) active.delete("italic");
    else if (code === 24) active.delete("underline");
    else if (code === 25) active.delete("blink");
    else if (code === 27) active.delete("inverse");
    else if (code === 28) active.delete("hidden");
    else if (code === 29) active.delete("strike");
    else if (code === 39) active.delete("foreground");
    else if (code === 49) active.delete("background");
    else if (code === 38) {
      active.set("foreground", ansi);
      index += codes[index + 1] === 2 ? 4 : codes[index + 1] === 5 ? 2 : 0;
    } else if (code === 48) {
      active.set("background", ansi);
      index += codes[index + 1] === 2 ? 4 : codes[index + 1] === 5 ? 2 : 0;
    } else if ((code >= 30 && code <= 37) || (code >= 90 && code <= 97)) {
      active.set("foreground", ansi);
    } else if ((code >= 40 && code <= 47) || (code >= 100 && code <= 107)) {
      active.set("background", ansi);
    }
  }
}

function splitLongWord(word: string, width: number): string[] {
  const parts: string[] = [];
  const totalWidth = visibleWidth(word);

  for (let offset = 0; offset < totalWidth; ) {
    const part = sliceAnsi(word, offset, offset + width);
    const partWidth = visibleWidth(part);
    if (partWidth === 0) break;

    parts.push(part);
    offset += partWidth;
  }

  return parts.length > 0 ? parts : [word];
}

const CJK_RE = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u;

function segmentWrapWords(text: string): string[] {
  const words: string[] = [];
  let current = "";

  const flush = () => {
    if (current === "") return;
    words.push(current);
    current = "";
  };

  for (let index = 0; index < text.length; ) {
    const rest = text.slice(index);
    const ansi = readAnsiSgr(rest);
    if (ansi) {
      current += ansi;
      index += ansi.length;
      continue;
    }

    const char = Array.from(rest)[0] ?? "";
    if (/^\s$/u.test(char)) {
      flush();
      let spaces = char;
      index += char.length;

      while (index < text.length) {
        const next = Array.from(text.slice(index))[0] ?? "";
        if (!/^\s$/u.test(next)) break;
        spaces += next;
        index += next.length;
      }

      words.push(spaces);
      continue;
    }

    if (CJK_RE.test(char)) {
      flush();
      words.push(char);
      index += char.length;
      continue;
    }

    current += char;
    index += char.length;
  }

  flush();
  return words;
}

function readAnsiSgr(text: string): string | null {
  if (text.charCodeAt(0) !== 0x1b || text[1] !== "[") return null;

  let index = 2;
  while (index < text.length) {
    const char = text[index] ?? "";
    if (char === "m") return text.slice(0, index + 1);
    if (!/^[0-9;]$/.test(char)) return null;
    index += 1;
  }

  return null;
}

export function wrapWithPrefix(text: string, width: number, wrap: boolean, prefix = ""): string[] {
  if (!wrap) return text.split("\n").map((line) => prefix + line);
  const out: string[] = [];
  const w = Math.max(1, width - visibleWidth(prefix));
  for (const line of text.split("\n")) {
    const parts = wrapText(line, w, wrap);
    for (const p of parts) out.push(prefix + p);
  }
  return out;
}
