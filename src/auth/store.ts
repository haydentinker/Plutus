import fs from "fs";
import path from "path";
import os from "os";

const CREDS_DIR = path.join(os.homedir(), ".plutus");
const CREDS_FILE = path.join(CREDS_DIR, "credentials.json");

export interface Credentials {
  access_token: string;
  item_id: string;
}

export function saveCredentials(creds: Credentials): void {
  fs.mkdirSync(CREDS_DIR, { recursive: true });
  fs.writeFileSync(CREDS_FILE, JSON.stringify(creds, null, 2), {
    mode: 0o600,
  });
}

export function loadCredentials(): Credentials | null {
  try {
    const raw = fs.readFileSync(CREDS_FILE, "utf8");
    return JSON.parse(raw) as Credentials;
  } catch {
    return null;
  }
}

export function hasCredentials(): boolean {
  return fs.existsSync(CREDS_FILE);
}
