export class TelegramClient {
  constructor(token) {
    this.token = token;
    this.baseUrl = `https://api.telegram.org/bot${token}`;
    this.textHandlers = [];
    this.messageHandlers = [];
    this.polling = false;
    this.offset = 0;
  }

  onText(regex, handler) {
    this.textHandlers.push({ regex, handler });
  }

  on(event, handler) {
    if (event === 'message') {
      this.messageHandlers.push(handler);
    }
    if (event === 'polling_error') {
      this.pollingErrorHandler = handler;
    }
  }

  async sendMessage(chatId, text, extra = {}) {
    return this.call('sendMessage', {
      chat_id: chatId,
      text,
      disable_web_page_preview: true,
      ...extra
    });
  }

  async startPolling() {
    this.polling = true;
    while (this.polling) {
      try {
        const payload = await this.call('getUpdates', {
          offset: this.offset,
          timeout: 30,
          allowed_updates: ['message']
        });

        for (const update of payload) {
          this.offset = update.update_id + 1;
          if (update.message) {
            await this.handleMessage(update.message);
          }
        }
      } catch (error) {
        if (this.pollingErrorHandler) {
          this.pollingErrorHandler(error);
        } else {
          console.error('[telegram polling error]', error);
        }
        await new Promise((resolve) => setTimeout(resolve, 3000));
      }
    }
  }

  async stopPolling() {
    this.polling = false;
  }

  async handleMessage(message) {
    if (message.text) {
      for (const { regex, handler } of this.textHandlers) {
        regex.lastIndex = 0;
        const match = regex.exec(message.text);
        if (match) {
          await handler(message, match);
        }
      }
    }

    for (const handler of this.messageHandlers) {
      await handler(message);
    }
  }

  async call(method, payload) {
    const response = await fetch(`${this.baseUrl}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await response.json().catch(() => null);
    if (!response.ok || !data?.ok) {
      const description = data?.description || response.statusText;
      throw new Error(`Telegram ${method} failed: ${response.status} ${description}`);
    }
    return data.result;
  }
}
