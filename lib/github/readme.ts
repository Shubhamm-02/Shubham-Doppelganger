const MAX_README_CHARS = 12_000;
const LINK_DEFINITION = /^\s{0,3}\[(?!\^)[^\]]+\]:\s*\S/;
const HTML_TAG =
  /<\/?(?:a|abbr|b|blockquote|center|code|dd|del|details|div|dl|dt|em|figcaption|figure|font|h[1-6]|hr|i|img|ins|kbd|li|ol|p|picture|pre|s|section|small|source|span|strong|sub|summary|sup|table|tbody|td|th|thead|tr|u|ul|video)(?:\s[^<>]*)?\/?>/gi;
const CODE_PLACEHOLDER = /\uE000(\d+)\uE000/g;

const HTML_ENTITIES: Record<string, string> = {
  "&nbsp;": " ",
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": "\"",
  "&#39;": "'"
};

function cleanInline(text: string) {
  return text
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/!\[[^\]]*\]\[[^\]]*\]/g, "")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(HTML_TAG, "")
    .replace(/\[\s*\]\([^)]*\)/g, "")
    .replace(/\[\s*\]\[[^\]]*\]/g, "")
    .replace(/\[([^\]]+)\]\((?!https?:|mailto:)[^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\[[^\]]*\]/g, "$1")
    .replace(/&(?:nbsp|amp|lt|gt|quot|#39);/g, (entity) => HTML_ENTITIES[entity]);
}

function cleanOutsideCode(text: string) {
  const codeSpans: string[] = [];
  const masked = text.replace(/`[^`\n]*`/g, (span) => `\uE000${codeSpans.push(span) - 1}\uE000`);
  return cleanInline(masked).replace(CODE_PLACEHOLDER, (_, index) => codeSpans[Number(index)]);
}

function proseBlocks(lines: string[]) {
  const text = lines
    .filter((line) => !LINK_DEFINITION.test(line))
    .join("\n")
    .replace(/<!--[\s\S]*?(?:-->|$)/g, "");

  return cleanOutsideCode(text)
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n")
    .split(/\n{2,}/)
    .map((block) => block.replace(/^\n+|\n+$/g, ""))
    .filter(Boolean);
}

function splitBlocks(markdown: string) {
  const blocks: string[] = [];
  const lines = markdown.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n").split("\n");
  let prose: string[] = [];
  let index = 0;

  while (index < lines.length) {
    const open = lines[index].match(/^\s*(`{3,}|~{3,})/);
    if (!open) {
      prose.push(lines[index]);
      index += 1;
      continue;
    }

    blocks.push(...proseBlocks(prose));
    prose = [];

    const marker = open[1];
    const closing = new RegExp(`^\\s*${marker[0]}{${marker.length},}\\s*$`);
    const fence = [lines[index].trimEnd()];
    index += 1;
    while (index < lines.length) {
      fence.push(lines[index].trimEnd());
      index += 1;
      if (closing.test(fence[fence.length - 1])) break;
    }
    blocks.push(fence.join("\n"));
  }

  blocks.push(...proseBlocks(prose));
  return blocks;
}

export function cleanReadme(markdown: string, maxChars = MAX_README_CHARS) {
  let output = "";

  for (const block of splitBlocks(markdown)) {
    if (block.length > maxChars) continue;
    const next = output ? `${output}\n\n${block}` : block;
    if (next.length > maxChars) break;
    output = next;
  }

  const hasBody = output.split("\n").some((line) => line.trim() && !/^#{1,6}\s/.test(line));
  return hasBody ? output : "";
}
