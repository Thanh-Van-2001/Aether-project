/**
 * ✦ Aether — Channel Manager
 * Routes messages between messaging platforms and the agent
 */

import { logger } from '../utils/logger.js';
import { TelegramChannel } from './telegram.js';
import { DiscordChannel } from './discord.js';
import { WebChatChannel } from './webchat.js';

class ChannelManager {
  constructor(config, agent) {
    this.config = config;
    this.agent = agent;
    this.channels = new Map();
  }

  async init(httpServer) {
    const channelConfig = this.config.channels;

    // Always enable WebChat
    if (channelConfig.webchat?.enabled !== false) {
      const webchat = new WebChatChannel(this.config, this.agent);
      await webchat.init(httpServer);
      this.channels.set('webchat', webchat);
      logger.info('Channel: WebChat ✓');
    }

    // Telegram
    if (channelConfig.telegram?.enabled && channelConfig.telegram.token) {
      try {
        const telegram = new TelegramChannel(this.config, this.agent);
        await telegram.init();
        this.channels.set('telegram', telegram);
        logger.info('Channel: Telegram ✓');
      } catch (err) {
        logger.error('Telegram init failed:', err.message);
      }
    }

    // Discord
    if (channelConfig.discord?.enabled && channelConfig.discord.token) {
      try {
        const discord = new DiscordChannel(this.config, this.agent);
        await discord.init();
        this.channels.set('discord', discord);
        logger.info('Channel: Discord ✓');
      } catch (err) {
        logger.error('Discord init failed:', err.message);
      }
    }

    logger.info(`${this.channels.size} channel(s) active`);
  }

  getChannel(name) {
    return this.channels.get(name);
  }

  async sendMessage(channelName, target, message) {
    const channel = this.channels.get(channelName);
    if (!channel) {
      throw new Error(`Channel not found: ${channelName}`);
    }
    return channel.send(target, message);
  }

  async shutdown() {
    for (const [name, channel] of this.channels) {
      try {
        await channel.shutdown?.();
        logger.debug(`Channel ${name} shut down`);
      } catch (err) {
        logger.error(`Error shutting down ${name}:`, err.message);
      }
    }
  }
}

export { ChannelManager };
export default ChannelManager;
