import { createClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";
import { writeFileSync, existsSync } from "node:fs";
import { localStatus } from "./local-supabase.mjs";

if (existsSync(".env.artist.local")) throw new Error(".env.artist.local already exists; reuse the existing local artist account.");
const status = localStatus();
const admin = createClient(status.API_URL, status.SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const email = "artist-" + randomBytes(4).toString("hex") + "@example.invalid";
const password = randomBytes(24).toString("base64url");
const { error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
if (error) throw new Error("Could not create the local artist account.");
writeFileSync(".env.artist.local", "ARTIST_EMAIL=" + email + "\nARTIST_PASSWORD=" + password + "\n", { flag: "wx" });
console.log("Created a local artist. Credentials are in ignored .env.artist.local; no credentials printed.");
