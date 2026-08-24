"use client";

import { cx } from "@/lib/utils";

export type JtbChatMessage = {
  id: number;
  role: "user" | "assistant";
  content: string;
  /** Set when the request failed; rendered inline so the user knows why. */
  error?: string;
};

export function MessageBubble({ message }: { message: JtbChatMessage }) {
  const isUser = message.role === "user";

  return (
    <div className={cx("flex", isUser ? "justify-end" : "justify-start")}>
      <div
        className={cx(
          "max-w-[85%] whitespace-pre-wrap rounded-lg px-4 py-2 text-sm leading-relaxed",
          isUser
            ? "bg-surface-2 text-fg"
            : "border border-border bg-surface text-fg",
        )}
      >
        <p>{message.content}</p>
        {message.error && (
          <p className="mt-2 text-xs text-accent-exp">{message.error}</p>
        )}
      </div>
    </div>
  );
}
