import type { Element, ElementContent, Root } from "hast";

const VOID_ELEMENTS = new Set(["br", "hr", "img", "input"]);

const CARET_CLASS =
  "ml-0.5 inline-block h-[1.05em] w-0.5 translate-y-[0.18em] rounded-full bg-accent animate-pulse motion-reduce:animate-none";

function lastMeaningfulChild(children: ElementContent[]) {
  for (let index = children.length - 1; index >= 0; index -= 1) {
    const child = children[index];
    if (child.type === "element") return child;
    if (child.type === "text" && child.value.trim()) return child;
  }
  return null;
}

export function rehypeCaret() {
  return (tree: Root) => {
    let parent: Root | Element = tree;
    for (;;) {
      const last = lastMeaningfulChild(parent.children as ElementContent[]);
      if (!last || last.type !== "element" || VOID_ELEMENTS.has(last.tagName)) break;
      parent = last;
    }
    parent.children.push({
      type: "element",
      tagName: "span",
      properties: { className: CARET_CLASS.split(" "), ariaHidden: "true" },
      children: []
    });
  };
}
