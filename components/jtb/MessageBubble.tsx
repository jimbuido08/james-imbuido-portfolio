"use client";

import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { cx } from "@/lib/utils";

export type JtbChatMessage = {
  id: number;
  role: "user" | "assistant";
  content: string;
  /** Set when the request failed; rendered inline so the user knows why. */
  error?: string;
};

/** Tailwind styles (design tokens) for markdown elements in assistant replies. */
const markdownComponents: Components = {
  p: ({ children }) => <p className="my-2 first:mt-0 last:mb-0">{children}</p>,
  ul: ({ children }) => (
    <ul className="my-2 list-disc space-y-1 pl-5 marker:text-fg-muted first:mt-0 last:mb-0">
      {children}
    </ul>
  ),
  ol: ({ children }) => (
    <ol className="my-2 list-decimal space-y-1 pl-5 marker:text-fg-muted first:mt-0 last:mb-0">
      {children}
    </ol>
  ),
  li: ({ children }) => <li>{children}</li>,
  strong: ({ children }) => (
    <strong className="font-semibold">{children}</strong>
  ),
  a: ({ children, href }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-accent-jtb underline underline-offset-2"
    >
      {children}
    </a>
  ),
  h1: ({ children }) => (
    <h1 className="mt-3 mb-1 text-sm font-semibold text-fg">{children}</h1>
  ),
  h2: ({ children }) => (
    <h2 className="mt-3 mb-1 text-sm font-semibold text-fg">{children}</h2>
  ),
  h3: ({ children }) => (
    <h3 className="mt-3 mb-1 text-sm font-semibold text-fg">{children}</h3>
  ),
  code: ({ children }) => (
    <code className="rounded bg-surface-2 px-1 py-0.5 font-mono text-xs">
      {children}
    </code>
  ),
  pre: ({ children }) => (
    <pre className="my-2 overflow-x-auto rounded bg-surface-2 p-2 text-xs">
      {children}
    </pre>
  ),
};

export function MessageBubble({ message }: { message: JtbChatMessage }) {
  const isUser = message.role === "user";

  return (
    <div className={cx("flex", isUser ? "justify-end" : "justify-start")}>
      <div
        className={cx(
          "max-w-[85%] rounded-lg px-4 py-2 text-sm leading-relaxed",
          // Users type literal newlines; assistant replies are markdown, which
          // manages its own spacing (kept on user bubbles only).
          isUser && "whitespace-pre-wrap",
          isUser
            ? "bg-surface-2 text-fg"
            : "border border-border bg-surface text-fg",
        )}
      >
        {isUser ? (
          <p>{message.content}</p>
        ) : (
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={markdownComponents}
          >
            {message.content}
          </ReactMarkdown>
        )}
        {message.error && (
          <p className="mt-2 text-xs text-accent-exp">{message.error}</p>
        )}
      </div>
    </div>
  );
}
