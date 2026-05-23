import dotenv from "dotenv";
import path from "path";
dotenv.config({ path: path.join(__dirname, "..", ".env") });
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { Configuration, PlaidApi, PlaidEnvironments } from "plaid";
import { loadCredentials } from "./auth/store";
import moment from "moment";

const { PLAID_CLIENT_ID, PLAID_SECRET, PLAID_ENV = "sandbox" } = process.env;

const plaid = new PlaidApi(
  new Configuration({
    basePath: PlaidEnvironments[PLAID_ENV as keyof typeof PlaidEnvironments],
    baseOptions: {
      headers: {
        "PLAID-CLIENT-ID": PLAID_CLIENT_ID ?? "",
        "PLAID-SECRET": PLAID_SECRET ?? "",
      },
    },
  })
);

function getAccessToken(): string {
  const creds = loadCredentials();
  if (!creds) throw new Error("No Plaid credentials found — run `npm run auth` first to link your bank.");
  return creds.access_token;
}

const server = new McpServer({
  name: "plutus",
  version: "1.0.0",
});

function plaidError(err: any): string {
  const status = err?.response?.status;
  const data = err?.response?.data;
  console.error("Plaid error:", JSON.stringify({ status, data }, null, 2));

  const detail = data?.error_code
    ? `[${data.error_code}] ${data.error_message} (${data.error_type})`
    : err?.message ?? String(err);

  return `Plaid error — ${detail}`;
}
server.registerTool(
  "get_transactions",
  {
    description: "Fetch recent transactions from the linked bank account",
    inputSchema: {},
  },
  async () => {
    try {
      const access_token = getAccessToken();
      console.error("token prefix:", access_token.slice(0, 20));
      const now = moment();
      const today = now.format('YYYY-MM-DD');
      const thirtyDaysAgo = now.subtract(30, 'days').format('YYYY-MM-DD');
      const { data } = await plaid.transactionsGet({
        access_token,
        start_date: thirtyDaysAgo,
        end_date: today,
      });
      return {
        content: [{ type: "text", text: JSON.stringify(data.transactions, null, 2) }],
      };
    } catch (err) {
      return { content: [{ type: "text", text: plaidError(err) }], isError: true };
    }
  }
);

server.registerTool(
  "get_balances",
  {
    description: "Get current balances for all linked accounts",
    inputSchema: {},
  },
  async () => {
    try {
      const access_token = getAccessToken();
      const { data } = await plaid.accountsBalanceGet({ access_token });
      return {
        content: [{ type: "text", text: JSON.stringify(data.accounts, null, 2) }],
      };
    } catch (err) {
      return { content: [{ type: "text", text: plaidError(err) }], isError: true };
    }
  }
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Plutus MCP server running on stdio");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
