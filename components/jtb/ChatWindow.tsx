"use client";

import { useState } from "react";

import {
  NETWORK_ERROR_MESSAGE,
  UNEXPECTED_RESPONSE_MESSAGE,
} from "@/lib/api/messages";
import { postJsonApi, useApiSubmit } from "@/lib/client/submit";
import type { JtbError, JtbSuccess } from "@/lib/jtb/types";
import { cx } from "@/lib/utils";
import { MessageList } from "./MessageList";
import type { JtbChatMessage } from "./MessageBubble";
import { ChatInput } from "./ChatInput";
import { CreditsBadge } from "./CreditsBadge";
import { ExhaustedState } from "./ExhaustedState";

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
  const { state, submit } = useApiSubmit<JtbSuccess, JtbError>();
  const pending = state.kind === "submitting";
  const exhausted = credits <= 0;

  const markError = (id: number, message: string) => {
    setMessages((prev) =>
      prev.map((m) => (m.id === id ? { ...m, error: message } : m)),
    );
  };

  const send = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || pending) return;

    const userMessage: JtbChatMessage = {
      id: nextId++,
      role: "user",
      content: trimmed,
    };
    setMessages((prev) => [...prev, userMessage]);

    const outcome = await submit(() =>
      postJsonApi<JtbSuccess, JtbError>("/api/jtb", { message: trimmed }),
    );
    if (!outcome) return;

    if (outcome.kind === "ok") {
      // No optimistic deduction — credits update only from the server.
      setMessages((prev) => [
        ...prev,
        { id: nextId++, role: "assistant", content: outcome.data.reply },
      ]);
      setCredits(outcome.data.creditsRemaining);
    } else if (outcome.kind === "rejected") {
      if (outcome.response.error.code === "exhausted") {
        setCredits(0);
      } else {
        markError(userMessage.id, outcome.response.error.message);
      }
    } else {
      markError(
        userMessage.id,
        outcome.kind === "unexpected"
          ? UNEXPECTED_RESPONSE_MESSAGE
          : NETWORK_ERROR_MESSAGE,
      );
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
