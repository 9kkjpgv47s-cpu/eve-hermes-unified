import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type { MemoryDispatchEvent, MemoryReadScope, UnifiedMemoryStore } from "./unified-memory-store.js";

type PersistedShape = {
  version: 1;
  chats: Record<string, Record<string, string>>;
  events: MemoryDispatchEvent[];
};

const DEFAULT_MAX_EVENTS = 500;

function emptyShape(): PersistedShape {
  return { version: 1, chats: {}, events: [] };
}

async function readShape(filePath: string): Promise<PersistedShape> {
  try {
    const raw = await readFile(filePath, "utf8");
    const parsed = JSON.parse(raw) as PersistedShape;
    if (parsed.version !== 1 || typeof parsed.chats !== "object" || !Array.isArray(parsed.events)) {
      return emptyShape();
    }
    return parsed;
  } catch {
    return emptyShape();
  }
}

/**
 * JSON-backed `UnifiedMemoryStore` for single-node persistence (Phase 3).
 * Uses atomic replace writes; serializes mutations through an in-process queue.
 */
export class FileBackedUnifiedMemoryStore implements UnifiedMemoryStore {
  private chain: Promise<void> = Promise.resolve();

  constructor(
    private readonly filePath: string,
    private readonly maxEvents = DEFAULT_MAX_EVENTS,
  ) {}

  private async runExclusive<T>(fn: () => Promise<T>): Promise<T> {
    const next = this.chain.then(fn, fn);
    this.chain = next.then(() => undefined, () => undefined);
    return next;
  }

  async readWorkingSet(scope: MemoryReadScope): Promise<Record<string, string>> {
    return this.runExclusive(async () => {
      const shape = await readShape(this.filePath);
      return { ...(shape.chats[scope.chatId] ?? {}) };
    });
  }

  async mergeWorkingSet(chatId: string, patch: Record<string, string>): Promise<void> {
    return this.runExclusive(async () => {
      const shape = await readShape(this.filePath);
      const row = { ...(shape.chats[chatId] ?? {}) };
      for (const [k, v] of Object.entries(patch)) {
        row[k] = v;
      }
      shape.chats[chatId] = row;
      await this.persist(shape);
    });
  }

  async appendDispatchEvent(event: MemoryDispatchEvent): Promise<void> {
    return this.runExclusive(async () => {
      const shape = await readShape(this.filePath);
      shape.events.push(event);
      if (shape.events.length > this.maxEvents) {
        shape.events.splice(0, shape.events.length - this.maxEvents);
      }
      await this.persist(shape);
    });
  }

  private async persist(shape: PersistedShape): Promise<void> {
    await mkdir(path.dirname(this.filePath), { recursive: true });
    const tmp = `${this.filePath}.${process.pid}.${Date.now()}.tmp`;
    await writeFile(tmp, `${JSON.stringify(shape, null, 2)}\n`, "utf8");
    await rename(tmp, this.filePath);
  }
}
