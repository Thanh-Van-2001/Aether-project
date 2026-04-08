/**
 * ✦ Aether — Discord Channel
 */

import { logger } from '../utils/logger.js';

class DiscordChannel {
  constructor(config, agent) {
    this.config = config;
    this.agent = agent;
    this.client = null;
    this.allowedUsers = config.channels.discord.allowedUsers || [];
  }

  async init() {
    const { Client, GatewayIntentBits } = await import('discord.js');

    this.client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.DirectMessages,
        GatewayIntentBits.MessageContent,
      ],
    });

    this.client.on('ready', () => {
      logger.info(`Discord bot: ${this.client.user.tag}`);
    });

    this.client.on('messageCreate', async (msg) => {
      await this._handleMessage(msg);
    });

    await this.client.login(this.config.channels.discord.token);
  }

  _isAllowed(userId) {
    if (this.allowedUsers.length === 0) return true;
    return this.allowedUsers.includes(String(userId));
  }

  _shouldRespond(msg) {
    // Ignore bots
    if (msg.author.bot) return false;

    // Always respond in DMs
    if (!msg.guild) return true;

    // In servers, respond when mentioned or when message starts with !aether
    const mentioned = msg.mentions.has(this.client.user);
    const prefixed = msg.content.startsWith('!aether');
    return mentioned || prefixed;
  }

  async _handleMessage(msg) {
    if (!this._shouldRespond(msg)) return;

    const userId = String(msg.author.id);
    if (!this._isAllowed(userId)) {
      await msg.reply('✦ Access denied.');
      return;
    }

    // Clean message (remove mention/prefix)
    let text = msg.content
      .replace(/<@!?\d+>/g, '')
      .replace(/^!aether\s*/i, '')
      .trim();

    if (!text) {
      await msg.reply('✦ Hey! Send me a message and I\'ll help you out.');
      return;
    }

    // Handle commands
    if (text === '/skills' || text === 'skills') {
      const skills = this.agent.getSkills();
      const list = skills.map(s => `${s.enabled ? '🟢' : '⚫'} ${s.icon || '🔧'} **${s.name}**`).join('\n');
      await msg.reply(`✦ **Active Skills:**\n${list}`);
      return;
    }

    if (text === '/clear' || text === 'clear history') {
      this.agent.clearHistory();
      await msg.reply('✦ Conversation history cleared.');
      return;
    }

    // Typing indicator
    await msg.channel.sendTyping();

    try {
      const response = await this.agent.chat(text, {
        channel: 'discord',
        userId,
      });

      // Discord limit: 2000 chars
      const maxLen = 1900;
      const responseText = response.text;

      if (responseText.length <= maxLen) {
        await msg.reply(responseText);
      } else {
        // Split
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

        await msg.reply(chunks[0]);
        for (let i = 1; i < chunks.length; i++) {
          await msg.channel.send(chunks[i]);
        }
      }
    } catch (err) {
      logger.error('Discord response error:', err.message);
      await msg.reply(`✦ Error: ${err.message}`);
    }
  }

  async send(channelId, message) {
    const channel = await this.client.channels.fetch(channelId);
    return channel.send(message);
  }

  async shutdown() {
    if (this.client) {
      this.client.destroy();
    }
  }
}

export { DiscordChannel };
export default DiscordChannel;
