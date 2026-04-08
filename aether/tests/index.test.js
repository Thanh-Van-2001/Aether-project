/**
 * ✦ Aether — Test Suite
 * Run: node --test tests/index.test.js
 */

import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

// ─── Config Tests ───
describe('Config', () => {
  it('should load default config without .env', async () => {
    const { loadConfig } = await import('../src/config.js');
    const config = loadConfig();

    assert.ok(config);
    assert.equal(config.model, process.env.AETHER_MODEL || 'claude-sonnet-4-20250514');
    assert.equal(config.maxTokens, parseInt(process.env.AETHER_MAX_TOKENS) || 4096);
    assert.equal(typeof config.sandbox, 'boolean');
    assert.ok(config.gateway);
    assert.ok(config.channels);
    assert.ok(config.memory);
  });

  it('should have correct gateway defaults', async () => {
    const { loadConfig } = await import('../src/config.js');
    const config = loadConfig();

    assert.equal(config.gateway.port, parseInt(process.env.GATEWAY_PORT) || 18789);
    assert.equal(config.gateway.host, process.env.GATEWAY_HOST || '127.0.0.1');
  });

  it('should have correct path defaults', async () => {
    const { loadConfig } = await import('../src/config.js');
    const config = loadConfig();

    assert.ok(config.root);
    assert.ok(config.workspace);
    assert.ok(config.skillsDir);
    assert.ok(config.builtinSkillsDir);
  });
});

// ─── Helpers Tests ───
describe('Helpers', () => {
  it('uuid() should generate unique IDs', async () => {
    const { uuid } = await import('../src/utils/helpers.js');
    const id1 = uuid();
    const id2 = uuid();

    assert.ok(id1);
    assert.ok(id2);
    assert.notEqual(id1, id2);
    assert.match(id1, /^[0-9a-f-]{36}$/);
  });

  it('truncate() should truncate long strings', async () => {
    const { truncate } = await import('../src/utils/helpers.js');

    assert.equal(truncate('hello', 10), 'hello');
    assert.equal(truncate('hello world this is long', 10), 'hello worl...');
    assert.equal(truncate('', 10), '');
    assert.equal(truncate(null, 10), null);
  });

  it('sanitizePath() should block directory traversal', async () => {
    const { sanitizePath } = await import('../src/utils/helpers.js');

    assert.equal(sanitizePath('../../etc/passwd'), 'etc/passwd');
    assert.equal(sanitizePath('normal/path.txt'), 'normal/path.txt');
    assert.equal(sanitizePath('../../../root'), 'root');
  });

  it('formatBytes() should format file sizes', async () => {
    const { formatBytes } = await import('../src/utils/helpers.js');

    assert.equal(formatBytes(0), '0 B');
    assert.equal(formatBytes(1024), '1 KB');
    assert.equal(formatBytes(1048576), '1 MB');
    assert.equal(formatBytes(500), '500 B');
  });

  it('extractCodeBlocks() should parse code blocks', async () => {
    const { extractCodeBlocks } = await import('../src/utils/helpers.js');

    const text = 'Here is code:\n```python\nprint("hello")\n```\nAnd more:\n```js\nconsole.log(1)\n```';
    const blocks = extractCodeBlocks(text);

    assert.equal(blocks.length, 2);
    assert.equal(blocks[0].language, 'python');
    assert.equal(blocks[0].code, 'print("hello")');
    assert.equal(blocks[1].language, 'js');
  });

  it('parseJSON() should safely parse JSON', async () => {
    const { parseJSON } = await import('../src/utils/helpers.js');

    assert.deepEqual(parseJSON('{"a":1}'), { a: 1 });
    assert.equal(parseJSON('invalid'), null);
    assert.equal(parseJSON(''), null);
  });
});

// ─── Skill Loader Tests ───
describe('SkillLoader', () => {
  it('should load built-in skills', async () => {
    const { SkillLoader } = await import('../src/skills/loader.js');
    const loader = new SkillLoader(ROOT);
    const skills = await loader.loadAll();

    assert.ok(Array.isArray(skills));
    assert.ok(skills.length >= 4, `Expected at least 4 skills, got ${skills.length}`);

    const ids = skills.map(s => s.id);
    assert.ok(ids.includes('web-search'), 'Missing web-search skill');
    assert.ok(ids.includes('code-exec'), 'Missing code-exec skill');
    assert.ok(ids.includes('file-manager'), 'Missing file-manager skill');
    assert.ok(ids.includes('summarizer'), 'Missing summarizer skill');
  });

  it('skills should have required fields', async () => {
    const { SkillLoader } = await import('../src/skills/loader.js');
    const loader = new SkillLoader(ROOT);
    const skills = await loader.loadAll();

    for (const skill of skills) {
      assert.ok(skill.id, `Skill missing id: ${JSON.stringify(skill)}`);
      assert.ok(skill.name, `Skill ${skill.id} missing name`);
      assert.ok(skill.instructions, `Skill ${skill.id} missing instructions`);
      assert.ok(skill.path, `Skill ${skill.id} missing path`);
    }
  });

  it('should parse SKILL.md frontmatter', async () => {
    const { SkillLoader } = await import('../src/skills/loader.js');
    const loader = new SkillLoader(ROOT);
    const skills = await loader.loadAll();

    const webSearch = skills.find(s => s.id === 'web-search');
    assert.ok(webSearch);
    assert.equal(webSearch.name, 'Web Search');
    assert.equal(webSearch.icon, '🔍');
    assert.ok(webSearch.description);
  });

  it('buildSkillPrompt() should generate valid prompt', async () => {
    const { SkillLoader } = await import('../src/skills/loader.js');
    const loader = new SkillLoader(ROOT);
    const skills = await loader.loadAll();
    const prompt = loader.buildSkillPrompt(skills);

    assert.ok(prompt.includes('<available_skills>'));
    assert.ok(prompt.includes('</available_skills>'));
    assert.ok(prompt.includes('Web Search'));
  });
});

// ─── Tool Registry Tests ───
describe('ToolRegistry', () => {
  it('should register tool definitions', async () => {
    const { ToolRegistry } = await import('../src/tools/registry.js');
    const { loadConfig } = await import('../src/config.js');
    const { MemoryManager } = await import('../src/memory/index.js');

    const config = loadConfig();
    config.memory.enabled = false;
    const memory = new MemoryManager(config);
    await memory.init();

    const registry = new ToolRegistry(config);
    await registry.init(memory);

    const defs = registry.getToolDefinitions();
    assert.ok(Array.isArray(defs));
    assert.ok(defs.length >= 7, `Expected at least 7 tools, got ${defs.length}`);

    const names = defs.map(d => d.name);
    assert.ok(names.includes('shell_exec'));
    assert.ok(names.includes('file_read'));
    assert.ok(names.includes('file_write'));
    assert.ok(names.includes('file_list'));
    assert.ok(names.includes('web_fetch'));
    assert.ok(names.includes('memory_add'));
    assert.ok(names.includes('memory_search'));
  });

  it('tool definitions should have valid schemas', async () => {
    const { ToolRegistry } = await import('../src/tools/registry.js');
    const { loadConfig } = await import('../src/config.js');
    const { MemoryManager } = await import('../src/memory/index.js');

    const config = loadConfig();
    config.memory.enabled = false;
    const memory = new MemoryManager(config);
    await memory.init();

    const registry = new ToolRegistry(config);
    await registry.init(memory);
    const defs = registry.getToolDefinitions();

    for (const def of defs) {
      assert.ok(def.name, 'Tool missing name');
      assert.ok(def.description, `Tool ${def.name} missing description`);
      assert.ok(def.input_schema, `Tool ${def.name} missing input_schema`);
      assert.equal(def.input_schema.type, 'object', `Tool ${def.name} schema type should be object`);
    }
  });
});

// ─── Memory Store Tests ───
describe('MemoryStore', () => {
  it('should add and retrieve memories (JSON fallback)', async () => {
    const { MemoryStore } = await import('../src/memory/store.js');
    const { uuid } = await import('../src/utils/helpers.js');

    const tmpPath = resolve(ROOT, `workspace/memory/test-${Date.now()}.db`);
    const store = new MemoryStore(tmpPath);
    // Force JSON fallback
    store.useFallback = true;
    store._initFallback();

    const id = uuid();
    store.addMemory({
      id,
      type: 'fact',
      content: 'Test memory content',
      source: 'test',
    });

    const memories = store.getMemories();
    assert.ok(memories.length >= 1);

    const found = memories.find(m => m.id === id);
    assert.ok(found);
    assert.equal(found.content, 'Test memory content');
    assert.equal(found.type, 'fact');

    // Cleanup
    store.deleteMemory(id);
    const after = store.getMemories();
    assert.ok(!after.find(m => m.id === id));

    // Remove test file
    const { unlinkSync } = await import('fs');
    try { unlinkSync(tmpPath.replace('.db', '.json')); } catch {}
  });

  it('should search memories', async () => {
    const { MemoryStore } = await import('../src/memory/store.js');
    const { uuid } = await import('../src/utils/helpers.js');

    const tmpPath = resolve(ROOT, `workspace/memory/test-search-${Date.now()}.db`);
    const store = new MemoryStore(tmpPath);
    store.useFallback = true;
    store._initFallback();

    store.addMemory({ id: uuid(), type: 'fact', content: 'User likes Python', source: 'test' });
    store.addMemory({ id: uuid(), type: 'fact', content: 'User likes TypeScript', source: 'test' });
    store.addMemory({ id: uuid(), type: 'fact', content: 'User lives in Hanoi', source: 'test' });

    const results = store.getMemories({ search: 'Python' });
    assert.equal(results.length, 1);
    assert.ok(results[0].content.includes('Python'));

    const { unlinkSync } = await import('fs');
    try { unlinkSync(tmpPath.replace('.db', '.json')); } catch {}
  });
});

// ─── File Ops Tool Tests ───
describe('FileOpsTool', () => {
  it('should read, write, and list files', async () => {
    const { FileOpsTool } = await import('../src/tools/file-ops.js');
    const { loadConfig } = await import('../src/config.js');

    const config = loadConfig();
    const tool = new FileOpsTool(config);

    // Write
    const writeResult = await tool.execute('file_write', {
      path: 'test-tmp-file.txt',
      content: 'Hello from Aether test!',
    });
    assert.ok(writeResult.success);

    // Read
    const readResult = await tool.execute('file_read', { path: 'test-tmp-file.txt' });
    assert.equal(readResult.content, 'Hello from Aether test!');

    // List
    const listResult = await tool.execute('file_list', { path: '.' });
    assert.ok(listResult.items);
    assert.ok(listResult.items.length > 0);

    // Cleanup
    const { unlinkSync } = await import('fs');
    try { unlinkSync(resolve(config.workspace, 'test-tmp-file.txt')); } catch {}
  });

  it('should block directory traversal in sandbox', async () => {
    const { FileOpsTool } = await import('../src/tools/file-ops.js');
    const { loadConfig } = await import('../src/config.js');

    const config = loadConfig();
    config.sandbox = true;
    config.allowedDirs = [];
    const tool = new FileOpsTool(config);

    const result = await tool.execute('file_read', { path: '../../../etc/passwd' });
    // Should either error or resolve within workspace
    assert.ok(result.error || !result.content?.includes('root:'));
  });
});

// ─── Shell Exec Tool Tests ───
describe('ShellExecTool', () => {
  it('should execute simple commands', async () => {
    const { ShellExecTool } = await import('../src/tools/shell-exec.js');
    const { loadConfig } = await import('../src/config.js');

    const config = loadConfig();
    const tool = new ShellExecTool(config);

    const result = await tool.execute('shell_exec', { command: 'echo "hello"' });
    assert.ok(result.stdout.includes('hello'));
    assert.equal(result.exitCode, 0);
  });

  it('should execute Node.js code', async () => {
    const { ShellExecTool } = await import('../src/tools/shell-exec.js');
    const { loadConfig } = await import('../src/config.js');

    const config = loadConfig();
    const tool = new ShellExecTool(config);

    const result = await tool.execute('shell_exec', {
      command: 'console.log(2 + 2)',
      language: 'node',
    });
    assert.ok(result.stdout.includes('4'));
  });

  it('should block dangerous commands in sandbox', async () => {
    const { ShellExecTool } = await import('../src/tools/shell-exec.js');
    const { loadConfig } = await import('../src/config.js');

    const config = loadConfig();
    config.sandbox = true;
    const tool = new ShellExecTool(config);

    const result = await tool.execute('shell_exec', { command: 'rm -rf /' });
    assert.ok(result.error);
  });
});

// ─── Logger Tests ───
describe('Logger', () => {
  it('should create logger instances', async () => {
    const { default: Logger } = await import('../src/utils/logger.js');

    const log = new Logger({ level: 'debug' });
    assert.ok(log);

    // Should not throw
    log.debug('test debug');
    log.info('test info');
    log.warn('test warn');
    log.error('test error');
  });

  it('should create child loggers', async () => {
    const { default: Logger } = await import('../src/utils/logger.js');

    const log = new Logger({ level: 'info' });
    const child = log.child('CHILD');
    assert.ok(child);
    assert.equal(child.prefix, 'CHILD');
  });
});
