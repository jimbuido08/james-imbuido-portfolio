"use client";

import { useEffect, useRef } from "react";

import { MessageBubble, type JtbChatMessage } from "./MessageBubble";

export function MessageList({
  messages,
  pending,
}: {
  messages: JtbChatMessage[];
  pending: boolean;
}) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, pending]);

  return (
    <div className="flex-1 overflow-y-auto px-4 py-4">
      {messages.length === 0 && !pending && (
        <p className="text-sm text-fg-subtle">
          Ask JTB anything about James&apos;s work, experience, or projects.
        </p>
      )}
      <div className="space-y-4">
        {messages.map((message) => (
          <MessageBubble key={message.id} message={message} />
        ))}
        {pending && (
          <div className="flex justify-start">
            <div className="rounded-lg border border-border bg-surface px-4 py-2 text-sm text-fg-muted">
              JTB is thinking…
            </div>
          </div>
        )}
      </div>
      <div ref={bottomRef} />
    </div>
  );
}
