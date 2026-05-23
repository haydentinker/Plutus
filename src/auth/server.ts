import "dotenv/config";
import express from "express";
import path from "path";
import open from "open";
import { saveCredentials } from "./store";
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
    const { public_token } = req.body as { public_token: string };
    if (!public_token) {
        res.status(400).json({ error: "public_token is required" });
        return;
    }
    try {
        const { data } = await plaid.itemPublicTokenExchange({ public_token });
        saveCredentials({ access_token: data.access_token, item_id: data.item_id });
        res.json({ ok: true });
        setTimeout(() => {
            console.log("✓ Bank linked. Closing terminal.");
            process.exit(0);
        }, 500);
    } catch (err: any) {
        console.error(err?.response?.data ?? err);
        res.status(500).json({ error: "Failed to exchange token" });
    }
});

app.listen(Number(PORT), () => {
    console.log("Opening Plutus auth...");
    open("http://localhost:3000");

});
