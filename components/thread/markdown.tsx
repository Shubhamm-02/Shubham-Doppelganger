import { memo } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { rehypeCaret } from "@/components/thread/rehype-caret";
import { cx } from "@/lib/client/cx";

const BLOCK_SPACING = "my-3 first:mt-0 last:mb-0";

function isExternal(href: string) {
  return /^https?:\/\//i.test(href) || href.startsWith("//");
}

const components: Components = {
  p: ({ node: _node, ...props }) => <p className={BLOCK_SPACING} {...props} />,
  a: ({ node: _node, href = "", children, ...props }) => (
    <a
      {...props}
      href={href}
      {...(isExternal(href) ? { target: "_blank", rel: "noopener noreferrer" } : {})}
      className="font-medium text-accent underline decoration-accent/35 underline-offset-[3px] transition-[text-decoration-color] duration-(--duration-fast) hover:decoration-accent"
    >
      {children}
    </a>
  ),
  ul: ({ node: _node, ...props }) => (
    <ul className={cx(BLOCK_SPACING, "list-disc space-y-1 pl-5 marker:text-fg-subtle")} {...props} />
  ),
  ol: ({ node: _node, ...props }) => (
    <ol className={cx(BLOCK_SPACING, "list-decimal space-y-1 pl-5 marker:text-fg-subtle marker:tabular-nums")} {...props} />
  ),
  li: ({ node: _node, ...props }) => <li className="pl-1 [&>ol]:my-1 [&>ul]:my-1" {...props} />,
  h1: ({ node: _node, ...props }) => <h3 className="mt-6 mb-2 text-17 font-semibold first:mt-0" {...props} />,
  h2: ({ node: _node, ...props }) => <h3 className="mt-6 mb-2 text-17 font-semibold first:mt-0" {...props} />,
  h3: ({ node: _node, ...props }) => <h4 className="mt-5 mb-1.5 text-15 font-semibold first:mt-0" {...props} />,
  h4: ({ node: _node, ...props }) => <h5 className="mt-5 mb-1.5 text-15 font-semibold first:mt-0" {...props} />,
  strong: ({ node: _node, ...props }) => <strong className="font-semibold text-fg" {...props} />,
  blockquote: ({ node: _node, ...props }) => (
    <blockquote className={cx(BLOCK_SPACING, "border-l-2 border-border-strong pl-4 text-fg-muted")} {...props} />
  ),
  hr: () => <hr className="my-6 border-border" />,
  pre: ({ node: _node, ...props }) => (
    <pre
      className={cx(
        BLOCK_SPACING,
        "overflow-x-auto rounded-md border border-border bg-sunken px-4 py-3 font-mono text-13 text-fg"
      )}
      {...props}
    />
  ),
  table: ({ node: _node, ...props }) => (
    <div className={cx(BLOCK_SPACING, "overflow-x-auto rounded-md border border-border")}>
      <table className="w-full border-collapse text-left text-14" {...props} />
    </div>
  ),
  th: ({ node: _node, ...props }) => (
    <th className="bg-sunken px-3 py-2 font-medium text-fg-muted" {...props} />
  ),
  td: ({ node: _node, ...props }) => <td className="border-t border-border px-3 py-2 align-top" {...props} />
};

const REMARK_PLUGINS = [remarkGfm];
const WITH_CARET = [rehypeCaret];
const DISALLOWED = ["img"];

export type MarkdownProps = { text: string; streaming?: boolean; className?: string };

export const Markdown = memo(function Markdown({ text, streaming = false, className }: MarkdownProps) {
  return (
    <div
      className={cx(
        "text-15 text-fg break-words",
        "[&_:not(pre)>code]:rounded-xs [&_:not(pre)>code]:bg-sunken [&_:not(pre)>code]:px-1 [&_:not(pre)>code]:py-px [&_:not(pre)>code]:font-mono [&_:not(pre)>code]:text-13",
        className
      )}
    >
      <ReactMarkdown
        remarkPlugins={REMARK_PLUGINS}
        rehypePlugins={streaming ? WITH_CARET : undefined}
        components={components}
        disallowedElements={DISALLOWED}
        unwrapDisallowed
      >
        {text}
      </ReactMarkdown>
    </div>
  );
});
