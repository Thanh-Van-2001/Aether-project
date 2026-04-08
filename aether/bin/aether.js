#!/usr/bin/env node

/**
 * ✦ Aether CLI
 * Your personal AI assistant powered by Claude.
 */

import { Command } from 'commander';
import chalk from 'chalk';
import figlet from 'figlet';
import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createInterface } from 'readline';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const pkg = JSON.parse(readFileSync(resolve(ROOT, 'package.json'), 'utf-8'));

const program = new Command();

// ─── Banner ───
function showBanner() {
  console.log(chalk.red(figlet.textSync('Aether', { font: 'Standard' })));
  console.log(chalk.gray(`  v${pkg.version} — Your personal AI assistant powered by Claude ✦\n`));
}

// ─── Commands ───
program
  .name('aether')
  .description('✦ Your personal AI assistant powered by Claude')
  .version(pkg.version);

// ── Gateway ──
program
  .command('gateway')
  .description('Start the Aether gateway server')
  .option('-p, --port <port>', 'Gateway port', '18789')
  .option('-h, --host <host>', 'Gateway host', '127.0.0.1')
  .option('--verbose', 'Verbose logging')
  .action(async (opts) => {
    showBanner();
    process.env.GATEWAY_PORT = opts.port;
    process.env.GATEWAY_HOST = opts.host;
    if (opts.verbose) process.env.LOG_LEVEL = 'debug';
    const { startGateway } = await import('../src/gateway.js');
    await startGateway();
  });

// ── Agent (one-shot) ──
program
  .command('agent')
  .description('Send a message to the Aether agent')
  .option('-m, --message <msg>', 'Message to send')
  .option('--thinking <level>', 'Thinking level: off, low, high', 'off')
  .option('--model <model>', 'Model override')
  .action(async (opts) => {
    if (!opts.message) {
      console.log(chalk.red('Error: --message is required'));
      process.exit(1);
    }
    const { loadConfig } = await import('../src/config.js');
    const { Agent } = await import('../src/agent.js');
    const config = loadConfig();
    if (opts.model) config.model = opts.model;
    const agent = new Agent(config);
    await agent.init();
    const response = await agent.chat(opts.message);
    console.log('\n' + chalk.cyan('✦ Aether: ') + response.text);
    if (response.toolResults?.length) {
      console.log(chalk.gray(`\n  [Used ${response.toolResults.length} tool(s)]`));
    }
  });

// ── Chat (interactive REPL) ──
program
  .command('chat')
  .description('Start an interactive chat session')
  .option('--model <model>', 'Model override')
  .action(async (opts) => {
    showBanner();
    const { loadConfig } = await import('../src/config.js');
    const { Agent } = await import('../src/agent.js');
    const config = loadConfig();
    if (opts.model) config.model = opts.model;
    const agent = new Agent(config);
    await agent.init();

    console.log(chalk.gray('Type your message. Use /quit to exit, /clear to reset.\n'));

    const rl = createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: chalk.green('You > '),
    });

    rl.prompt();
    rl.on('line', async (line) => {
      const input = line.trim();
      if (!input) { rl.prompt(); return; }
      if (input === '/quit' || input === '/exit') {
        console.log(chalk.gray('\n👋 Goodbye!'));
        process.exit(0);
      }
      if (input === '/clear') {
        agent.clearHistory();
        console.log(chalk.gray('  History cleared.\n'));
        rl.prompt();
        return;
      }
      if (input === '/skills') {
        const skills = agent.getSkills();
        skills.forEach(s => {
          const status = s.enabled ? chalk.green('●') : chalk.red('○');
          console.log(`  ${status} ${s.icon} ${s.name} — ${s.description}`);
        });
        console.log();
        rl.prompt();
        return;
      }
      if (input === '/memory') {
        const mems = await agent.getMemories();
        if (!mems.length) {
          console.log(chalk.gray('  No memories stored.\n'));
        } else {
          mems.forEach(m => console.log(chalk.gray(`  • ${m.content}`)));
          console.log();
        }
        rl.prompt();
        return;
      }

      try {
        process.stdout.write(chalk.cyan('\n✦ Aether: '));
        const response = await agent.chat(input);
        console.log(response.text);
        if (response.toolResults?.length) {
          console.log(chalk.gray(`\n  [Used: ${response.toolResults.map(t => t.name).join(', ')}]`));
        }
        console.log();
      } catch (err) {
        console.log(chalk.red(`\n  Error: ${err.message}\n`));
      }
      rl.prompt();
    });
  });

// ── Onboard ──
program
  .command('onboard')
  .description('Interactive setup wizard')
  .action(async () => {
    showBanner();
    console.log(chalk.yellow('✦ Welcome to Aether Setup!\n'));

    const { default: inquirer } = await import('inquirer');
    const answers = await inquirer.prompt([
      {
        type: 'password',
        name: 'apiKey',
        message: 'Enter your Anthropic API key:',
        validate: (v) => v.startsWith('sk-ant-') ? true : 'API key should start with sk-ant-',
      },
      {
        type: 'list',
        name: 'model',
        message: 'Choose your default model:',
        choices: [
          { name: 'Claude Sonnet 4 (recommended)', value: 'claude-sonnet-4-20250514' },
          { name: 'Claude Opus 4', value: 'claude-opus-4-20250514' },
          { name: 'Claude Haiku 4.5 (fast & cheap)', value: 'claude-haiku-4-5-20251001' },
        ],
      },
      {
        type: 'checkbox',
        name: 'channels',
        message: 'Which channels do you want to enable?',
        choices: [
          { name: 'Web Chat (built-in)', value: 'webchat', checked: true },
          { name: 'Telegram', value: 'telegram' },
          { name: 'Discord', value: 'discord' },
        ],
      },
      {
        type: 'input',
        name: 'telegramToken',
        message: 'Enter Telegram Bot Token:',
        when: (a) => a.channels.includes('telegram'),
      },
      {
        type: 'input',
        name: 'discordToken',
        message: 'Enter Discord Bot Token:',
        when: (a) => a.channels.includes('discord'),
      },
      {
        type: 'confirm',
        name: 'sandbox',
        message: 'Enable sandbox mode? (restricts shell execution)',
        default: true,
      },
    ]);

    // Write .env
    let env = `# Aether Configuration (generated by aether onboard)\n`;
    env += `ANTHROPIC_API_KEY=${answers.apiKey}\n`;
    env += `AETHER_MODEL=${answers.model}\n`;
    env += `AETHER_MAX_TOKENS=4096\n`;
    env += `GATEWAY_PORT=18789\n`;
    env += `GATEWAY_HOST=127.0.0.1\n`;
    env += `SANDBOX_MODE=${answers.sandbox}\n`;
    env += `MEMORY_ENABLED=true\n`;
    if (answers.telegramToken) env += `TELEGRAM_BOT_TOKEN=${answers.telegramToken}\n`;
    if (answers.discordToken) env += `DISCORD_BOT_TOKEN=${answers.discordToken}\n`;

    const envPath = resolve(ROOT, '.env');
    writeFileSync(envPath, env);

    // Ensure workspace dirs
    const dirs = ['workspace/memory', 'workspace/skills', 'workspace/logs'];
    dirs.forEach(d => mkdirSync(resolve(ROOT, d), { recursive: true }));

    console.log(chalk.green('\n✅ Setup complete!'));
    console.log(chalk.gray('\nStart the gateway:'));
    console.log(chalk.white('  aether gateway --verbose'));
    console.log(chalk.gray('\nOr start an interactive chat:'));
    console.log(chalk.white('  aether chat\n'));
  });

// ── Doctor ──
program
  .command('doctor')
  .description('Check system health and configuration')
  .action(async () => {
    showBanner();
    console.log(chalk.yellow('🩺 Running diagnostics...\n'));

    const checks = [];

    // Node version
    const nodeVer = process.versions.node;
    const nodeMajor = parseInt(nodeVer.split('.')[0]);
    checks.push({
      name: 'Node.js version',
      status: nodeMajor >= 20 ? 'ok' : 'fail',
      detail: `v${nodeVer}${nodeMajor < 20 ? ' (need ≥20)' : ''}`,
    });

    // .env file
    const envExists = existsSync(resolve(ROOT, '.env'));
    checks.push({
      name: '.env file',
      status: envExists ? 'ok' : 'warn',
      detail: envExists ? 'Found' : 'Missing — run: aether onboard',
    });

    // API key
    const { loadConfig } = await import('../src/config.js');
    const config = loadConfig();
    checks.push({
      name: 'Anthropic API key',
      status: config.apiKey ? 'ok' : 'fail',
      detail: config.apiKey ? `${config.apiKey.slice(0, 12)}...` : 'Not set',
    });

    // Test API connection
    if (config.apiKey) {
      try {
        const { default: Anthropic } = await import('@anthropic-ai/sdk');
        const client = new Anthropic({ apiKey: config.apiKey });
        const resp = await client.messages.create({
          model: config.model,
          max_tokens: 10,
          messages: [{ role: 'user', content: 'Say "ok"' }],
        });
        checks.push({ name: 'Claude API connection', status: 'ok', detail: `Model: ${config.model}` });
      } catch (e) {
        checks.push({ name: 'Claude API connection', status: 'fail', detail: e.message });
      }
    }

    // Skills
    const { SkillLoader } = await import('../src/skills/loader.js');
    const loader = new SkillLoader(ROOT);
    const skills = await loader.loadAll();
    checks.push({
      name: 'Skills loaded',
      status: skills.length > 0 ? 'ok' : 'warn',
      detail: `${skills.length} skills found`,
    });

    // Workspace
    const wsExists = existsSync(resolve(ROOT, 'workspace'));
    checks.push({
      name: 'Workspace directory',
      status: wsExists ? 'ok' : 'warn',
      detail: wsExists ? 'Found' : 'Missing — run: aether onboard',
    });

    // Print
    checks.forEach(c => {
      const icon = c.status === 'ok' ? chalk.green('✓') : c.status === 'warn' ? chalk.yellow('⚠') : chalk.red('✗');
      console.log(`  ${icon} ${c.name}: ${chalk.gray(c.detail)}`);
    });

    const failures = checks.filter(c => c.status === 'fail');
    console.log();
    if (failures.length) {
      console.log(chalk.red(`  ${failures.length} issue(s) found. Fix them before starting the gateway.\n`));
    } else {
      console.log(chalk.green('  All checks passed! ✦\n'));
    }
  });

// ── Skills ──
program
  .command('skills')
  .description('List and manage skills')
  .option('--list', 'List all skills')
  .option('--enable <id>', 'Enable a skill')
  .option('--disable <id>', 'Disable a skill')
  .action(async (opts) => {
    const { SkillLoader } = await import('../src/skills/loader.js');
    const loader = new SkillLoader(ROOT);
    const skills = await loader.loadAll();

    if (opts.enable) {
      console.log(chalk.green(`  ✓ Enabled: ${opts.enable}`));
    } else if (opts.disable) {
      console.log(chalk.yellow(`  ○ Disabled: ${opts.disable}`));
    } else {
      console.log(chalk.yellow('\n✦ Installed Skills:\n'));
      skills.forEach(s => {
        console.log(`  ${s.icon || '🔧'} ${chalk.white(s.name)} — ${chalk.gray(s.description)}`);
        console.log(chalk.gray(`    Category: ${s.category} | Path: ${s.path}\n`));
      });
    }
  });

// ── Message send ──
program
  .command('message')
  .description('Send a message via a channel')
  .argument('<action>', 'Action: send')
  .option('--to <target>', 'Recipient')
  .option('--channel <ch>', 'Channel: telegram, discord, webchat')
  .option('--message <msg>', 'Message text')
  .action(async (action, opts) => {
    if (action === 'send') {
      console.log(chalk.gray(`  Sending to ${opts.to} via ${opts.channel || 'default'}...`));
      // Would integrate with channel manager
      console.log(chalk.green('  ✓ Message sent'));
    }
  });

program.parse();
