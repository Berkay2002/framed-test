"use client";

import { cn } from "@/lib/utils";

export type Message = {
  type?: string;
  text?: string;
  error?: string;
};

export function FormMessage({
  message,
  className,
}: {
  message?: Message;
  className?: string;
}) {
  if (!message || (!message.text && !message.error)) return null;

  const text = message.text || message.error;
  const type = message.type || (message.error ? "error" : "success");

  return (
    <p
      className={cn(
        "mt-2 text-sm",
        type === "error" ? "text-destructive" : "text-green-500",
        className,
      )}
    >
      {text}
    </p>
  );
}
