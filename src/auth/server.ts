import "dotenv/config";
import express from "express";
import path from "path";
import open from "open";
import { saveAccount, loadAccounts, removeAccount } from "./store";
import {
    Configuration,
    PlaidApi,
    PlaidEnvironments,
    Products,
    CountryCode,
} from "plaid";

const { PLAID_CLIENT_ID, PLAID_SECRET, PLAID_ENV = "sandbox", PORT = "3000" } =
    process.env;

if (!PLAID_CLIENT_ID || !PLAID_SECRET) {
    console.error("Missing PLAID_CLIENT_ID or PLAID_SECRET in environment");
    process.exit(1);
}

const plaid = new PlaidApi(
    new Configuration({
        basePath: PlaidEnvironments[PLAID_ENV as keyof typeof PlaidEnvironments],
        baseOptions: {
            headers: {
                "PLAID-CLIENT-ID": PLAID_CLIENT_ID,
                "PLAID-SECRET": PLAID_SECRET,
            },
        },
    })
);

export const app = express();

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

app.get("/api/accounts", (_req, res) => {
    const accounts = loadAccounts().map(({ item_id, institution_name, label, added_at }) => ({
        item_id,
        institution_name,
        label,
        added_at,
    }));
    res.json({ accounts });
});

app.post("/api/create-link-token", async (_req, res) => {
    try {
        const { data } = await plaid.linkTokenCreate({
            user: { client_user_id: "local-user" },
            client_name: "Plutus",
            products: [Products.Transactions],
            country_codes: [CountryCode.Us],
            language: "en",
        });
        res.json({ link_token: data.link_token });
    } catch (err: any) {
        console.error(err?.response?.data ?? err);
        res.status(500).json({ error: "Failed to create link token" });
    }
});

app.post("/api/exchange-token", async (req, res) => {
    const { public_token, institution_name = "Bank Account", label } = req.body as {
        public_token: string;
        institution_name?: string;
        label?: string;
    };
    if (!public_token) {
        res.status(400).json({ error: "public_token is required" });
        return;
    }
    try {
        const { data } = await plaid.itemPublicTokenExchange({ public_token });
        saveAccount({
            access_token: data.access_token,
            item_id: data.item_id,
            institution_name,
            label: label ?? institution_name,
            added_at: new Date().toISOString(),
        });
        console.log(`✓ Linked: ${label ?? institution_name}`);
        res.json({ ok: true });
    } catch (err: any) {
        console.error(err?.response?.data ?? err);
        res.status(500).json({ error: "Failed to exchange token" });
    }
});

app.delete("/api/accounts/:item_id", (req, res) => {
    removeAccount(req.params.item_id);
    res.json({ ok: true });
});

app.listen(Number(PORT), () => {
    console.log(`Plutus auth open at http://localhost:${PORT} — press Ctrl+C when done.`);
    open(`http://localhost:${PORT}`);
});
