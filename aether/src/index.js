/**
 * ✦ Aether — Main Entry Point
 * Your personal AI assistant powered by Claude
 */

import { startGateway } from './gateway.js';

// If run directly, start the gateway
const args = process.argv.slice(2);
if (args.includes('--gateway') || args.length === 0) {
  startGateway().catch(err => {
    console.error('Failed to start Aether:', err);
    process.exit(1);
  });
}

export { startGateway };
export { Agent } from './agent.js';
export { loadConfig } from './config.js';
export { MemoryManager } from './memory/index.js';
export { SkillLoader } from './skills/loader.js';
export { ToolRegistry } from './tools/registry.js';
export { ChannelManager } from './channels/manager.js';
export { BackgroundAgentRunner, Scheduler, Watcher, PipelineEngine } from './agents/index.js';
export { KnowledgeBase } from './knowledge/index.js';
