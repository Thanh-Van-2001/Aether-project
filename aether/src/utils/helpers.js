/**
 * ✦ Aether — Utility Helpers
 */

import { randomUUID } from 'crypto';

export function uuid() {
  return randomUUID();
}

export function truncate(str, len = 100) {
  if (!str || str.length <= len) return str;
  return str.slice(0, len) + '...';
}

export function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export function parseJSON(str) {
  try {
    return JSON.parse(str);
  } catch {
    return null;
  }
}

export function sanitizePath(path) {
  // Prevent directory traversal
  return path.replace(/\.\.\//g, '').replace(/\.\.\\/g, '');
}

export function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

export function extractCodeBlocks(text) {
  const blocks = [];
  const regex = /```(\w*)\n([\s\S]*?)```/g;
  let match;
  while ((match = regex.exec(text)) !== null) {
    blocks.push({ language: match[1] || 'text', code: match[2].trim() });
  }
  return blocks;
}

export function timeSince(date) {
  const seconds = Math.floor((new Date() - date) / 1000);
  const intervals = [
    { label: 'year', seconds: 31536000 },
    { label: 'month', seconds: 2592000 },
    { label: 'day', seconds: 86400 },
    { label: 'hour', seconds: 3600 },
    { label: 'minute', seconds: 60 },
  ];
  for (const i of intervals) {
    const count = Math.floor(seconds / i.seconds);
    if (count > 0) return `${count} ${i.label}${count !== 1 ? 's' : ''} ago`;
  }
  return 'just now';
}
