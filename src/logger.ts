import { appendFileSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const LOG_DIR = resolve(__dirname, '../.logs');

// Ensure log directory exists
try {
  mkdirSync(LOG_DIR, { recursive: true });
} catch {
  // ignore
}

type LogLevel = 'error' | 'warn' | 'info' | 'debug' | 'trace';

const LEVELS: Record<LogLevel, number> = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
  trace: 4,
};

function currentLevel(): LogLevel {
  const env = (process.env.MCP_FUNNEL_LOG_LEVEL || '').toLowerCase();
  if (env && ['error', 'warn', 'info', 'debug', 'trace'].includes(env)) {
    return env as LogLevel;
  }
  return 'info';
}

function enabled(min: LogLevel): boolean {
  const lvl = currentLevel();
  return LEVELS[lvl] >= LEVELS[min];
}

function runId(): string {
  if (!process.env.MCP_FUNNEL_RUN_ID) {
    // Stable per-process identifier so multiple files can correlate
    process.env.MCP_FUNNEL_RUN_ID = `${Date.now()}-${process.pid}`;
  }
  return process.env.MCP_FUNNEL_RUN_ID;
}

function logFile(): string {
  return resolve(LOG_DIR, `run-${runId()}.jsonl`);
}

export function logEvent(level: LogLevel, event: string, data?: unknown): void {
  // Always write to file when logging is enabled or level is error
  const loggingEnabled =
    process.env.MCP_FUNNEL_LOG === '1' ||
    process.env.MCP_FUNNEL_LOG === 'true' ||
    level === 'error';
  if (!loggingEnabled) return;

  // Respect level threshold for non-error levels
  if (level !== 'error' && !enabled(level)) return;

  const entry = {
    ts: new Date().toISOString(),
    pid: process.pid,
    level,
    event,
    data,
  };
  try {
    appendFileSync(logFile(), JSON.stringify(entry) + '\n', {
      encoding: 'utf8',
    });
  } catch {
    // Avoid throwing from logger
  }
}

export function logError(
  context: string,
  rawError: unknown,
  extra?: unknown,
): void {
  const err = rawError as { message?: string; stack?: string; code?: unknown };
  logEvent('error', `error:${context}`, {
    message: err?.message ?? String(rawError),
    stack: err?.stack,
    code: (err as { code?: unknown })?.code,
    extra,
    argv: process.argv,
    cwd: process.cwd(),
  });
}

export function getServerStreamLogPath(
  serverName: string,
  stream: 'stderr' | 'stdout',
): string {
  return resolve(LOG_DIR, `run-${runId()}-${serverName}.${stream}.log`);
}
