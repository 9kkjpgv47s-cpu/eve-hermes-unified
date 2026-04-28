export type TelegramApiResult<T> = { ok: true; result: T } | { ok: false; description?: string; error_code?: number };

async function telegramPost<T>(token: string, method: string, body: Record<string, unknown>): Promise<TelegramApiResult<T>> {
  const url = `https://api.telegram.org/bot${encodeURIComponent(token)}/${method}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const parsed = (await res.json()) as TelegramApiResult<T>;
  return parsed;
}

export async function telegramSendMessage(
  token: string,
  chatId: number | string,
  text: string,
  options?: { replyToMessageId?: number; parseMode?: "HTML" | "Markdown" | "MarkdownV2" },
): Promise<TelegramApiResult<{ message_id: number }>> {
  const body: Record<string, unknown> = {
    chat_id: chatId,
    text: text.slice(0, 4096),
  };
  if (options?.replyToMessageId !== undefined) {
    body.reply_to_message_id = options.replyToMessageId;
  }
  if (options?.parseMode) {
    body.parse_mode = options.parseMode;
  }
  return telegramPost<{ message_id: number }>(token, "sendMessage", body);
}

export async function telegramSetWebhook(
  token: string,
  webhookUrl: string,
  options?: { secretToken?: string; dropPendingUpdates?: boolean },
): Promise<TelegramApiResult<boolean>> {
  const body: Record<string, unknown> = {
    url: webhookUrl,
    allowed_updates: ["message"],
  };
  if (options?.secretToken?.trim()) {
    body.secret_token = options.secretToken.trim();
  }
  if (options?.dropPendingUpdates) {
    body.drop_pending_updates = true;
  }
  return telegramPost<boolean>(token, "setWebhook", body);
}
