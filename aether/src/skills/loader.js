/**
 * ✦ Aether — Skill Loader
 * Loads skills from SKILL.md files (OpenClaw-compatible format)
 */

import { readdirSync, readFileSync, existsSync } from 'fs';
import { resolve, basename } from 'path';
import { logger } from '../utils/logger.js';

class SkillLoader {
  constructor(rootDir) {
    this.rootDir = rootDir;
    this.builtinDir = resolve(rootDir, 'src/skills/builtin');
    this.workspaceDir = resolve(rootDir, 'workspace/skills');
  }

  /**
   * Parse a SKILL.md file into a skill object
   */
  parseSkillMd(filePath) {
    try {
      const content = readFileSync(filePath, 'utf-8');
      const skill = {
        path: filePath,
        enabled: true,
        category: 'custom',
      };

      // Parse YAML frontmatter
      const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
      if (fmMatch) {
        const lines = fmMatch[1].split('\n');
        for (const line of lines) {
          const [key, ...valueParts] = line.split(':');
          if (key && valueParts.length) {
            const value = valueParts.join(':').trim();
            skill[key.trim()] = value;
          }
        }
      }

      // Extract body (instructions)
      const body = fmMatch
        ? content.slice(fmMatch[0].length).trim()
        : content.trim();
      skill.instructions = body;

      // Extract tool definitions if present
      const toolMatch = body.match(/## Tools?\n([\s\S]*?)(?=\n## |\n---|\Z)/);
      if (toolMatch) {
        skill.toolDefinitions = this._parseToolDefinitions(toolMatch[1]);
      }

      return skill;
    } catch (e) {
      logger.warn(`Failed to parse skill: ${filePath}: ${e.message}`);
      return null;
    }
  }

  _parseToolDefinitions(text) {
    const tools = [];
    const toolBlocks = text.split(/\n### /);
    for (const block of toolBlocks) {
      if (!block.trim()) continue;
      const lines = block.trim().split('\n');
      const name = lines[0].replace(/[`*]/g, '').trim();
      const description = lines.slice(1).join('\n').trim();
      if (name) {
        tools.push({ name, description });
      }
    }
    return tools;
  }

  /**
   * Load all skills from builtin and workspace directories
   */
  async loadAll() {
    const skills = [];

    // Load builtin skills
    if (existsSync(this.builtinDir)) {
      const dirs = readdirSync(this.builtinDir, { withFileTypes: true })
        .filter(d => d.isDirectory());

      for (const dir of dirs) {
        const skillPath = resolve(this.builtinDir, dir.name, 'SKILL.md');
        if (existsSync(skillPath)) {
          const skill = this.parseSkillMd(skillPath);
          if (skill) {
            skill.id = skill.id || dir.name;
            skill.category = 'builtin';
            skill.source = 'builtin';
            skills.push(skill);
          }
        }
      }
    }

    // Load workspace skills (override builtin)
    if (existsSync(this.workspaceDir)) {
      const dirs = readdirSync(this.workspaceDir, { withFileTypes: true })
        .filter(d => d.isDirectory());

      for (const dir of dirs) {
        const skillPath = resolve(this.workspaceDir, dir.name, 'SKILL.md');
        if (existsSync(skillPath)) {
          const skill = this.parseSkillMd(skillPath);
          if (skill) {
            skill.id = skill.id || dir.name;
            skill.category = skill.category || 'workspace';
            skill.source = 'workspace';
            // Workspace skills override builtin
            const existingIdx = skills.findIndex(s => s.id === skill.id);
            if (existingIdx >= 0) {
              skills[existingIdx] = skill;
            } else {
              skills.push(skill);
            }
          }
        }
      }
    }

    logger.info(`Loaded ${skills.length} skill(s)`);
    return skills;
  }

  /**
   * Build skill instructions for system prompt
   */
  buildSkillPrompt(skills) {
    const enabled = skills.filter(s => s.enabled);
    if (!enabled.length) return '';

    let prompt = '\n\n<available_skills>\n';
    for (const skill of enabled) {
      prompt += `<skill name="${skill.name || skill.id}">\n`;
      if (skill.description) prompt += `Description: ${skill.description}\n`;
      if (skill.instructions) prompt += `${skill.instructions}\n`;
      prompt += `</skill>\n\n`;
    }
    prompt += '</available_skills>';
    return prompt;
  }
}

export { SkillLoader };
export default SkillLoader;
