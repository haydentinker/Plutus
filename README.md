# Plutus

A local [Model Context Protocol (MCP)](https://modelcontextprotocol.io) server that connects Claude to your real bank accounts via the [Plaid API](https://plaid.com). Ask Claude questions about your finances in plain English — balances, recent transactions, spending — without pasting data manually.

## How it works

```
Plaid Link (browser)
      │  bank auth
      ▼
Auth Server (Express)  ──saves──▶  ~/.plutus/credentials.json
                                          │
                                          │ reads
                                          ▼
                                  MCP Server (stdio)
                                          │
                                          ▼
                                       Claude
```

1. **Auth flow** — an Express server opens a browser with Plaid Link. After you connect your bank, the access token is saved locally at `~/.plutus/credentials.json` (chmod 600, never committed).
2. **MCP server** — a stdio MCP server exposes tools Claude can call. Each tool reads the stored token and calls the Plaid API on your behalf.

## Tools

| Tool | Description |
|---|---|
| `get_balances` | Current balances across all linked accounts |
| `get_transactions` | Last 30 days of transactions |

## Stack

- **TypeScript** — fully typed end to end
- **MCP SDK** (`@modelcontextprotocol/sdk`) — stdio transport for Claude integration
- **Plaid Node SDK** — bank data via Plaid's financial API
- **Express 5** — minimal auth server for the Plaid Link flow
- **Zod** — runtime schema validation for tool inputs

## Getting started

### Prerequisites

- Node.js 18+
- A [Plaid account](https://dashboard.plaid.com) (free sandbox tier works)
- Claude Desktop with MCP support

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
```

Fill in your Plaid credentials from the [Plaid dashboard](https://dashboard.plaid.com/developers/keys):

```env
PLAID_CLIENT_ID=your_client_id
PLAID_SECRET=your_sandbox_secret
PLAID_ENV=sandbox
PORT=3000
```

### 3. Link your bank account

```bash
npm run auth
```

This opens a browser, walks you through Plaid Link, and saves your access token to `~/.plutus/credentials.json`. The server exits automatically once your account is linked.

### 4. Build the MCP server

```bash
npm run build
```

### 5. Connect to Claude Desktop

Add this to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "plutus": {
      "command": "node",
      "args": ["/absolute/path/to/Plutus/dist/index.js"]
    }
  }
}
```

Restart Claude Desktop. You can now ask things like:

> *"What's my checking account balance?"*
> *"How much did I spend on food last month?"*
> *"Show me my most recent transactions."*

## Security

- Access tokens are stored at `~/.plutus/credentials.json` with `0600` permissions (owner read/write only)
- Credentials are never committed — `.env` and `~/.plutus/` are both gitignored
- Sandbox mode uses Plaid test data and never touches real bank accounts
