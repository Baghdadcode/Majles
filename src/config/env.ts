import { config } from "dotenv";

let loaded = false;

/** Loads .env.local (server side only). The key is never logged or returned to clients. */
export function loadEnv(): void {
  if (loaded) return;
  config({ path: ".env.local", quiet: true });
  config({ quiet: true });
  loaded = true;
}

export class MissingApiKeyError extends Error {
  constructor() {
    super(
      "ANTHROPIC_API_KEY is missing. Create .env.local (see .env.example) with a Console API key from " +
        "console.anthropic.com. A Claude.ai subscription will not work with the API.",
    );
    this.name = "MissingApiKeyError";
  }
}

export function getApiKey(): string {
  loadEnv();
  const key = process.env.ANTHROPIC_API_KEY?.trim();
  if (!key) throw new MissingApiKeyError();
  return key;
}

export function getDbPath(): string {
  loadEnv();
  return process.env.COUNCIL_DB_PATH ?? "./data/council.db";
}
