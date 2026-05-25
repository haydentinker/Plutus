# Plutus

A local [Model Context Protocol (MCP)](https://modelcontextprotocol.io) server that connects Claude to your real bank accounts via the [Plaid API](https://plaid.com). Ask Claude questions about your finances in plain English — balances, transactions, spending breakdowns, recurring payments — without pasting data manually.

## How it works

```
Plaid Link (browser)
      │  bank auth + label
      ▼
Auth Server (Express)  ──saves──▶  ~/.plutus/credentials.json
                                          │
                                          │ reads
                                          ▼
                                  MCP Server (stdio)
                                          │
                                 ┌────────┴────────┐
                                 │                 │
                              Tools           Prompts
                                 │                 │
                                 └────────┬────────┘
                                          ▼
                                       Claude
```

1. **Auth flow** — an Express server opens a browser with Plaid Link. After connecting your bank, you give the account a label (e.g. "Chase Personal") and the access token is saved locally at `~/.plutus/credentials.json` (chmod 600, never committed). You can link as many accounts as you want.
2. **MCP server** — a stdio MCP server exposes tools, a resource, and prompts that Claude uses to answer financial questions.

## Tools

| Tool | Description |
|---|---|
| `get_balances` | Current balances for all linked accounts |
| `get_transactions` | Transactions for a date range (default: last 30 days) |
| `get_recurring_transactions` | Recurring payments inferred by Plaid |
| `get_spending_by_category` | Spending totals grouped by category for a date range |

All tools accept an optional `label` parameter to filter to a specific linked account, and default to aggregating across all accounts when omitted.

## Resources

| Resource | Description |
|---|---|
| `plutus://accounts` | All linked accounts with labels, institution names, and IDs — Claude reads this as context before making tool calls |

## Prompts

Prompts appear as slash commands in Claude Desktop. Each one pre-wires the right tool calls and instructs Claude on what analysis to produce.

| Prompt | Description |
|---|---|
| `spending-summary` | Spending breakdown with category totals and actionable suggestions |
| `find-subscriptions` | Recurring payments grouped by type with cancellation flags |
| `monthly-overview` | Full financial snapshot: balances + spend + notable transactions |
| `compare-spending` | Side-by-side category diff between two months |

All prompts accept an optional `label` to scope to one account.

## Stack

- **TypeScript** — fully typed end to end
- **MCP SDK** (`@modelcontextprotocol/sdk`) — stdio transport, tools, resources, and prompts
- **Plaid Node SDK** — bank data via Plaid's financial API
- **Express 5** — minimal auth server for the Plaid Link flow
- **Zod** — runtime schema validation for tool and prompt inputs

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

### 3. Link your bank accounts

```bash
npm run auth
```

This opens a browser with the Plaid Link flow. After connecting a bank, you'll be prompted to give it a label (e.g. "Chase Personal"). You can link as many accounts as you want — press `Ctrl+C` when done.

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

> *"What's my current balance across all accounts?"*
> *"How much did I spend on food last month?"*
> *"Show me my subscriptions and flag any I should cancel."*
> *"Compare my spending in April vs May."*

Or use the built-in prompts directly:

> *"/spending-summary"*
> *"/monthly-overview month=2026-04"*
> *"/compare-spending month_a=2026-04 month_b=2026-05"*

## Security

- Access tokens are stored at `~/.plutus/credentials.json` with `0600` permissions (owner read/write only)
- Credentials are never committed — `.env` and `~/.plutus/` are both gitignored
- Sandbox mode uses Plaid test data and never touches real bank accounts
- The auth server runs locally and exits when you close the tab or press `Ctrl+C`
