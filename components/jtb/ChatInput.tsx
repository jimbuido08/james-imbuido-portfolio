"use client";

import { useState, type FormEvent, type KeyboardEvent } from "react";

import { MAX_MESSAGE_LENGTH } from "@/lib/jtb/constants";
import { Button } from "@/components/ui/Button";
import { chatFieldClasses } from "@/components/ui/fieldClasses";

export function ChatInput({
  onSend,
  disabled,
}: {
  onSend: (text: string) => void;
  disabled: boolean;
}) {
  const [value, setValue] = useState("");

  const send = () => {
    const text = value.trim();
    if (!text || disabled) return;
    onSend(text);
    setValue("");
  };

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    send();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      send();
    }
  };

  return (
    <form onSubmit={onSubmit} className="space-y-2">
      <textarea
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={onKeyDown}
        maxLength={MAX_MESSAGE_LENGTH}
        rows={3}
        disabled={disabled}
        placeholder="Ask about James's work, experience, or projects…"
        className={chatFieldClasses}
      />
      <div className="flex items-center justify-between gap-4">
        <p className="text-xs text-fg-subtle">
          Enter to send · Shift+Enter for a new line
        </p>
        <Button type="submit" disabled={disabled || !value.trim()}>
          Send
        </Button>
      </div>
    </form>
  );
}
