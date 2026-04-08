/**
 * ✦ Aether — Telegram Channel
 */

import { logger } from '../utils/logger.js';

class TelegramChannel {
  constructor(config, agent) {
    this.config = config;
    this.agent = agent;
    this.bot = null;
    this.allowedUsers = config.channels.telegram.allowedUsers || [];
  }

  async init() {
    const TelegramBot = (await import('node-telegram-bot-api')).default;
    const token = this.config.channels.telegram.token;

    this.bot = new TelegramBot(token, { polling: true });

    this.bot.on('message', async (msg) => {
      await this._handleMessage(msg);
    });

    const me = await this.bot.getMe();
    logger.info(`Telegram bot: @${me.username}`);
  }

  _isAllowed(userId) {
    if (this.allowedUsers.length === 0) return true;
    return this.allowedUsers.includes(String(userId));
  }

  async _handleMessage(msg) {
    const chatId = msg.chat.id;
    const userId = String(msg.from.id);
    const text = msg.text;

    if (!text) return;

    // Check permissions
    if (!this._isAllowed(userId)) {
      logger.warn(`Telegram: unauthorized user ${userId}`);
      await this.bot.sendMessage(chatId, '✦ Access denied. Your user ID is not in the allowed list.');
      return;
    }

    // Ignore bot commands that aren't for us
    if (text.startsWith('/start')) {
      await this.bot.sendMessage(chatId, '✦ Hello! I\'m Aether, your personal AI assistant powered by Claude.\n\nSend me any message and I\'ll help you out!');
      return;
    }

    if (text.startsWith('/help')) {
      await this.bot.sendMessage(chatId,
        '✦ *Aether Commands:*\n\n' +
        '/start — Initialize bot\n' +
        '/help — Show this help\n' +
        '/skills — List active skills\n' +
        '/memory — Show stored memories\n' +
        '/clear — Clear conversation history\n\n' +
        'Or just send me any message!',
        { parse_mode: 'Markdown' }
      );
      return;
    }

    if (text === '/skills') {
      const skills = this.agent.getSkills();
      const list = skills.map(s => `${s.enabled ? '●' : '○'} ${s.icon || '🔧'} ${s.name}`).join('\n');
      await this.bot.sendMessage(chatId, `✦ *Active Skills:*\n\n${list}`, { parse_mode: 'Markdown' });
      return;
    }

    if (text === '/memory') {
      const mems = await this.agent.getMemories({ limit: 10 });
      if (!mems.length) {
        await this.bot.sendMessage(chatId, '✦ No memories stored yet.');
        return;
      }
      const list = mems.map(m => `• ${m.content}`).join('\n');
      await this.bot.sendMessage(chatId, `✦ *Memories:*\n\n${list}`, { parse_mode: 'Markdown' });
      return;
    }

    if (text === '/clear') {
      this.agent.clearHistory();
      await this.bot.sendMessage(chatId, '✦ Conversation history cleared.');
      return;
    }

    // Send typing indicator
    await this.bot.sendChatAction(chatId, 'typing');

    try {
      const response = await this.agent.chat(text, {
        channel: 'telegram',
        userId,
      });

      // Split long messages (Telegram limit: 4096 chars)
      const maxLen = 4000;
      const responseText = response.text;

      if (responseText.length <= maxLen) {
        await this.bot.sendMessage(chatId, responseText, { parse_mode: 'Markdown' }).catch(() => {
          // Fallback without markdown if parsing fails
          return this.bot.sendMessage(chatId, responseText);
        });
      } else {
        // Split into chunks
        const chunks = [];
        let remaining = responseText;
        while (remaining.length > 0) {
          if (remaining.length <= maxLen) {
            chunks.push(remaining);
            break;
          }
          let splitAt = remaining.lastIndexOf('\n', maxLen);
          if (splitAt === -1) splitAt = maxLen;
          chunks.push(remaining.slice(0, splitAt));
          remaining = remaining.slice(splitAt);
        }

        for (const chunk of chunks) {
          await this.bot.sendMessage(chatId, chunk).catch(() => {});
        }
      }
    } catch (err) {
      logger.error('Telegram response error:', err.message);
      await this.bot.sendMessage(chatId, `✦ Error: ${err.message}`);
    }
  }

  async send(chatId, message) {
    if (!this.bot) throw new Error('Telegram bot not initialized');
    return this.bot.sendMessage(chatId, message);
  }

  async shutdown() {
    if (this.bot) {
      await this.bot.stopPolling();
    }
  }
}

export { TelegramChannel };
export default TelegramChannel;
