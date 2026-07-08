import stringWidth from "string-width";
import stripAnsi from "strip-ansi";

/**
 * Visible width of a string, ignoring ANSI escape codes.
 */
export function visibleWidth(text: string): number {
  return stringWidth(stripAnsi(text));
}

/**
 * Wrap a single paragraph string into lines respecting visible width.
 * Breaks on spaces and CJK character boundaries. Other words longer than width overflow.
 */
export function wrapText(text: string, width: number, wrap: boolean): string[] {
  if (!wrap || width <= 0) return [text];
  const words = segmentWrapWords(text);
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
  return lines;
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
