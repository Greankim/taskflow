/* Run: npm run seed:root-admin
 * Requires env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
 *               ROOT_ADMIN_USERNAME, ROOT_ADMIN_PASSWORD, ROOT_ADMIN_EMAIL?
 */
import { config } from "dotenv";
import { existsSync } from "fs";
import { resolve } from "path";

// Load .env.local first (Next.js convention), fall back to .env
const localPath = resolve(process.cwd(), ".env.local");
if (existsSync(localPath)) config({ path: localPath });
else config();

import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const username = process.env.ROOT_ADMIN_USERNAME!;
const password = process.env.ROOT_ADMIN_PASSWORD!;
// Must match usernameToEmail() in lib/utils.ts — login form will look up this exact email
const email = `${username.toLowerCase().trim()}@taskflow.app`;

if (!url || !serviceKey || !username || !password) {
  console.error("Missing env vars. Required: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ROOT_ADMIN_USERNAME, ROOT_ADMIN_PASSWORD");
  process.exit(1);
}

const supabase = createClient(url, serviceKey, { auth: { persistSession: false } });

async function main() {
  console.log(`Seeding root admin: ${username} (${email})`);
  // Check existing
  const { data: existing } = await supabase.from("profiles").select("id").eq("username", username).maybeSingle();
  let userId = existing?.id;

  if (!userId) {
    const { data, error } = await supabase.auth.admin.createUser({
      email, password, email_confirm: true,
      user_metadata: { username },
    });
    if (error) { console.error(error); process.exit(1); }
    userId = data.user!.id;
    console.log("Created auth user:", userId);
  } else {
    console.log("User already exists, will only promote role:", userId);
  }

  const { error: upErr } = await supabase
    .from("profiles")
    .upsert({ id: userId, username, role: "root_admin" });
  if (upErr) { console.error(upErr); process.exit(1); }

  console.log("✅ Root admin ready. Login with username:", username);
}
main();
