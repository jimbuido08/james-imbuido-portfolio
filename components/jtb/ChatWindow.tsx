"use client";

import { useState } from "react";

import type { JtbError, JtbSuccess } from "@/lib/jtb/types";
import { cx } from "@/lib/utils";
import { MessageList } from "./MessageList";
import type { JtbChatMessage } from "./MessageBubble";
import { ChatInput } from "./ChatInput";
import { CreditsBadge } from "./CreditsBadge";
import { ExhaustedState } from "./ExhaustedState";

const NETWORK_ERROR =
  "Something went wrong — your credit was not used.";

let nextId = 1;

export function ChatWindow({
  initialCredits,
  className,
}: {
  initialCredits: number;
  className?: string;
}) {
  const [messages, setMessages] = useState<JtbChatMessage[]>([]);
  const [credits, setCredits] = useState(initialCredits);
  const [pending, setPending] = useState(false);
  const exhausted = credits <= 0;

  const markError = (id: number, message: string) => {
    setMessages((prev) =>
      prev.map((m) => (m.id === id ? { ...m, error: message } : m)),
    );
  };

  const send = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || pending) return;

    setPending(true);
    const userMessage: JtbChatMessage = {
      id: nextId++,
      role: "user",
      content: trimmed,
    };
    setMessages((prev) => [...prev, userMessage]);

    try {
      const response = await fetch("/api/jtb", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: trimmed }),
      });
      const body = (await response.json()) as JtbSuccess | JtbError;

      if (response.ok && "reply" in body) {
        // No optimistic deduction — credits update only from the server.
        setMessages((prev) => [
          ...prev,
          { id: nextId++, role: "assistant", content: body.reply },
        ]);
        setCredits(body.creditsRemaining);
      } else if ("error" in body) {
        if (body.error.code === "exhausted") {
          setCredits(0);
        } else {
          markError(userMessage.id, body.error.message);
        }
      } else {
        markError(userMessage.id, NETWORK_ERROR);
      }
    } catch {
      markError(userMessage.id, NETWORK_ERROR);
    } finally {
      setPending(false);
    }
  };

  return (
    <div
      className={cx(
        "flex h-[60vh] min-h-[28rem] flex-col overflow-hidden rounded-lg border border-border bg-surface",
        className,
      )}
    >
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <p className="text-sm font-medium text-fg">JTB</p>
        <CreditsBadge credits={credits} />
      </div>
      <MessageList messages={messages} pending={pending} />
      <div className="border-t border-border p-4">
        {exhausted ? (
          <ExhaustedState />
        ) : (
          <ChatInput onSend={send} disabled={pending} />
        )}
      </div>
    </div>
  );
}
