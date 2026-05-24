import fs from "fs";
import path from "path";
import os from "os";

const CREDS_DIR = path.join(os.homedir(), ".plutus");
const CREDS_FILE = path.join(CREDS_DIR, "credentials.json");

export interface Account {
  access_token: string;
  item_id: string;
  institution_name: string;
  label: string;
  added_at: string;
}

function readRaw(): Account[] {
  try {
    const raw = fs.readFileSync(CREDS_FILE, "utf8");
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [{
        access_token: parsed.access_token,
        item_id: parsed.item_id,
        institution_name: "Bank Account",
        label: parsed.label ?? parsed.institution_name ?? "Bank Account",
        added_at: new Date().toISOString(),
      }];
    }
    return (parsed as Account[]).map(a => ({ ...a, label: a.label ?? a.institution_name }));
  } catch {
    return [];
  }
}

export function saveAccount(account: Account): void {
  fs.mkdirSync(CREDS_DIR, { recursive: true });
  const accounts = readRaw().filter(a => a.item_id !== account.item_id);
  accounts.push(account);
  fs.writeFileSync(CREDS_FILE, JSON.stringify(accounts, null, 2), { mode: 0o600 });
}

export function loadAccounts(): Account[] {
  return readRaw();
}

export function removeAccount(item_id: string): void {
  const accounts = readRaw().filter(a => a.item_id !== item_id);
  fs.mkdirSync(CREDS_DIR, { recursive: true });
  fs.writeFileSync(CREDS_FILE, JSON.stringify(accounts, null, 2), { mode: 0o600 });
}

export function hasAccounts(): boolean {
  return readRaw().length > 0;
}
