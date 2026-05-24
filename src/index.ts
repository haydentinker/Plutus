import dotenv from "dotenv";
import path from "path";
dotenv.config({ path: path.join(__dirname, "..", ".env") });
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { Configuration, PlaidApi, PlaidEnvironments } from "plaid";
import { z } from "zod";
import { loadAccounts } from "./auth/store";
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

function getAccounts(label?: string) {
  const all = loadAccounts();
  if (all.length === 0) {
    throw new Error("No accounts linked — run `npm run auth` first to link your bank.");
  }
  if (!label) return all;
  const filtered = all.filter(
    (a) => a.label.toLowerCase() === label.toLowerCase()
  );
  if (filtered.length === 0) {
    throw new Error(
      `No account found with label "${label}". Linked accounts: ${all.map((a) => a.label).join(", ")}`
    );
  }
  return filtered;
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

const accountLabelParam = z
  .string()
  .optional()
  .describe("Account label to filter by (e.g. 'Chase Personal'). Omit to include all linked accounts.");

server.registerTool(
  "get_transactions",
  {
    description: "Fetch transactions from linked bank accounts. Defaults to the last 30 days across all accounts.",
    inputSchema: {
      label: accountLabelParam,
      start_date: z
        .string()
        .optional()
        .describe("Start date in YYYY-MM-DD format. Defaults to 30 days ago."),
      end_date: z
        .string()
        .optional()
        .describe("End date in YYYY-MM-DD format. Defaults to today."),
    },
  },
  async ({ label, start_date, end_date }) => {
    try {
      const accounts = getAccounts(label);
      const end = end_date ?? moment().format("YYYY-MM-DD");
      const start = start_date ?? moment().subtract(30, "days").format("YYYY-MM-DD");

      const results = await Promise.all(
        accounts.map(async ({ access_token, institution_name: name }) => {
          const { data } = await plaid.transactionsGet({
            access_token,
            start_date: start,
            end_date: end,
          });
          return data.transactions.map((t) => ({ ...t, institution_name: name }));
        })
      );

      const transactions = results
        .flat()
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

      return {
        content: [{ type: "text", text: JSON.stringify(transactions, null, 2) }],
      };
    } catch (err) {
      return { content: [{ type: "text", text: plaidError(err) }], isError: true };
    }
  }
);

server.registerTool(
  "get_balances",
  {
    description: "Get current balances for linked accounts. Defaults to all linked accounts.",
    inputSchema: {
      label: accountLabelParam,
    },
  },
  async ({ label }) => {
    try {
      const accounts = getAccounts(label);

      const results = await Promise.all(
        accounts.map(async ({ access_token, institution_name: name }) => {
          const { data } = await plaid.accountsBalanceGet({ access_token });
          return data.accounts.map((a) => ({ ...a, institution_name: name }));
        })
      );

      return {
        content: [{ type: "text", text: JSON.stringify(results.flat(), null, 2) }],
      };
    } catch (err) {
      return { content: [{ type: "text", text: plaidError(err) }], isError: true };
    }
  }
);

server.registerTool(
  "get_recurring_transactions",
  {
    description: "Get recurring transactions inferred by Plaid. Defaults to all linked accounts.",
    inputSchema: {
      label: accountLabelParam,
    },
  },
  async ({ label }) => {
    try {
      const accounts = getAccounts(label);

      const results = await Promise.all(
        accounts.map(async ({ access_token, institution_name: name }) => {
          const { data } = await plaid.transactionsRecurringGet({ access_token });
          return data.outflow_streams.map((s) => ({ ...s, institution_name: name }));
        })
      );

      return {
        content: [{ type: "text", text: JSON.stringify(results.flat(), null, 2) }],
      };
    } catch (err) {
      return { content: [{ type: "text", text: plaidError(err) }], isError: true };
    }
  }
);

server.registerTool(
  "get_spending_by_category",
  {
    description: "Get spending totals grouped by category. Defaults to the last 30 days across all linked accounts.",
    inputSchema: {
      label: accountLabelParam,
      start_date: z
        .string()
        .optional()
        .describe("Start date in YYYY-MM-DD format. Defaults to 30 days ago."),
      end_date: z
        .string()
        .optional()
        .describe("End date in YYYY-MM-DD format. Defaults to today."),
    },
  },
  async ({ label, start_date, end_date }) => {
    try {
      const accounts = getAccounts(label);
      const end = end_date ?? moment().format("YYYY-MM-DD");
      const start = start_date ?? moment().subtract(30, "days").format("YYYY-MM-DD");

      const results = await Promise.all(
        accounts.map(async ({ access_token }) => {
          const { data } = await plaid.transactionsGet({
            access_token,
            start_date: start,
            end_date: end,
          });
          return data.transactions;
        })
      );

      const totals = new Map<string, { amount: number; count: number }>();

      for (const tx of results.flat()) {
        const category = tx.personal_finance_category?.primary ?? "Uncategorized";
        const entry = totals.get(category) ?? { amount: 0, count: 0 };
        entry.amount += Math.abs(tx.amount);
        entry.count += 1;
        totals.set(category, entry);
      }

      const sorted = [...totals.entries()]
        .map(([category, { amount, count }]) => ({
          category,
          amount: +amount.toFixed(2),
          count,
        }))
        .sort((a, b) => b.amount - a.amount);

      return {
        content: [{ type: "text", text: JSON.stringify(sorted, null, 2) }],
      };
    } catch (err) {
      return { content: [{ type: "text", text: plaidError(err) }], isError: true };
    }
  }
);

server.registerResource(
  "linked-accounts",
  "plutus://accounts",
  { description: "All bank accounts currently linked to Plutus, including their labels and institution names." },
  async () => {
    const accounts = loadAccounts().map(({ item_id, label, institution_name, added_at }) => ({
      item_id,
      label,
      institution_name,
      added_at,
    }));
    return {
      contents: [{
        uri: "plutus://accounts",
        mimeType: "application/json",
        text: JSON.stringify(accounts, null, 2),
      }],
    };
  }
);

server.registerPrompt(
  "spending-summary",
  {
    description: "Summarize and analyze spending over a date range",
    argsSchema: {
      start_date: z.string().optional().describe("Start date YYYY-MM-DD. Defaults to 30 days ago."),
      end_date: z.string().optional().describe("End date YYYY-MM-DD. Defaults to today."),
      label: z.string().optional().describe("Filter to a specific account label. Omit for all accounts."),
    },
  },
  ({ start_date, end_date, label }) => {
    const dateClause = start_date && end_date
      ? `from ${start_date} to ${end_date}`
      : start_date ? `from ${start_date} to today`
        : end_date ? `up to ${end_date}`
          : "over the last 30 days";
    const accountClause = label ? ` for the "${label}" account` : "";
    return {
      messages: [{
        role: "user",
        content: {
          type: "text",
          text: `Use the get_spending_by_category tool to get my spending${accountClause} ${dateClause}. Then give me a clear breakdown: total spent, the top 5 categories with amounts, anything that looks unusually high, and 2–3 concrete suggestions for where I could cut back.`,
        },
      }],
    };
  }
);

server.registerPrompt(
  "find-subscriptions",
  {
    description: "List all recurring payments and flag ones worth reviewing",
    argsSchema: {
      label: z.string().optional().describe("Filter to a specific account label. Omit for all accounts."),
    },
  },
  ({ label }) => {
    const accountClause = label ? ` for the "${label}" account` : "";
    return {
      messages: [{
        role: "user",
        content: {
          type: "text",
          text: `Use the get_recurring_transactions tool${accountClause} to fetch all my recurring payments. Group them by type (streaming, software/SaaS, utilities, memberships, etc.), show the frequency and amount for each, calculate the monthly total, and flag any that seem redundant or worth cancelling.`,
        },
      }],
    };
  }
);

server.registerPrompt(
  "monthly-overview",
  {
    description: "Full financial snapshot for a given month",
    argsSchema: {
      month: z.string().optional().describe("Month in YYYY-MM format (e.g. 2026-04). Defaults to the current month."),
      label: z.string().optional().describe("Filter to a specific account label. Omit for all accounts."),
    },
  },
  ({ month, label }) => {
    const now = moment();
    const target = month ? moment(month, "YYYY-MM") : now.clone();
    const start = target.startOf("month").format("YYYY-MM-DD");
    const end = target.endOf("month").format("YYYY-MM-DD");
    const monthLabel = target.format("MMMM YYYY");
    const accountClause = label ? ` for the "${label}" account` : "";
    return {
      messages: [{
        role: "user",
        content: {
          type: "text",
          text: `Give me a complete financial overview for ${monthLabel}${accountClause}. Use get_balances for my current position, get_spending_by_category with start_date="${start}" and end_date="${end}" for the spending breakdown, and get_transactions with the same dates for notable individual transactions. Summarize: opening vs current balances, total spend by category, top 5 individual transactions, and an overall assessment of the month.`,
        },
      }],
    };
  }
);

server.registerPrompt(
  "compare-spending",
  {
    description: "Compare spending between two months side by side",
    argsSchema: {
      month_a: z.string().optional().describe("First month YYYY-MM. Defaults to last month."),
      month_b: z.string().optional().describe("Second month YYYY-MM. Defaults to current month."),
      label: z.string().optional().describe("Filter to a specific account label. Omit for all accounts."),
    },
  },
  ({ month_a, month_b, label }) => {
    const now = moment();
    const mA = month_a ? moment(month_a, "YYYY-MM") : now.clone().subtract(1, "month");
    const mB = month_b ? moment(month_b, "YYYY-MM") : now.clone();
    const aStart = mA.clone().startOf("month").format("YYYY-MM-DD");
    const aEnd = mA.clone().endOf("month").format("YYYY-MM-DD");
    const bStart = mB.clone().startOf("month").format("YYYY-MM-DD");
    const bEnd = mB.clone().endOf("month").format("YYYY-MM-DD");
    const accountClause = label ? ` for the "${label}" account` : "";
    return {
      messages: [{
        role: "user",
        content: {
          type: "text",
          text: `Compare my spending between ${mA.format("MMMM YYYY")} and ${mB.format("MMMM YYYY")}${accountClause}. Call get_spending_by_category twice — once with start_date="${aStart}" end_date="${aEnd}", and once with start_date="${bStart}" end_date="${bEnd}". Then show a side-by-side table of every category with the amounts for each month and the dollar and percentage change. Highlight categories that went up or down by more than 20% and give an overall summary of what changed.`,
        },
      }],
    };
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
