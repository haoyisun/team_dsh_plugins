import {
  appendFile,
  mkdir,
  rename,
  stat,
} from 'node:fs/promises';
import path from 'node:path';

import { redactSecrets } from './runtime-contract.mjs';

const MAX_LOG_BYTES = 1024 * 1024;

export class SafeLog {
  #file;
  #pending = Promise.resolve();

  constructor(directory) {
    this.#file = path.join(directory, 'desktop.log');
  }

  async initialize() {
    await mkdir(path.dirname(this.#file), { recursive: true });
    try {
      if ((await stat(this.#file)).size >= MAX_LOG_BYTES) {
        await rename(this.#file, `${this.#file}.1`).catch(async () => {
          await rename(this.#file, `${this.#file}.${Date.now()}`);
        });
      }
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }

  write(source, value) {
    const safeValue = redactSecrets(value).replace(/\r?\n$/, '');
    if (!safeValue) return;
    const line = `${new Date().toISOString()} [${source}] ${safeValue}\n`;
    this.#pending = this.#pending
      .then(() => appendFile(this.#file, line, 'utf8'))
      .catch(() => {});
    return this.#pending;
  }
}
