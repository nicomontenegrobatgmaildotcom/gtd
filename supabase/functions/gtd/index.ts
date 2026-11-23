// Capture API used by Siri, Gmail (Apps Script) and anything else.
//   POST {title, notes?, source?}  -> adds an item to the inbox
//   GET                            -> items with a due date (for calendar sync)
// Every request needs the header  x-key: <GTD_KEY>

import { createClient } from "npm:@supabase/supabase-js@2";

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const KEY = Deno.env.get("GTD_KEY");
const OWNER = Deno.env.get("OWNER_ID");

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

Deno.serve(async (req) => {
  if (!KEY || req.headers.get("x-key") !== KEY) return json({ error: "unauthorized" }, 401);

  if (req.method === "POST") {
    const b = await req.json().catch(() => ({}));
    const title = String(b.title ?? "").trim();
    if (!title) return json({ error: "title is required" }, 400);
    const { data, error } = await db.from("items")
      .insert({ user_id: OWNER, title, notes: String(b.notes ?? ""), source: String(b.source ?? "api") })
      .select("id").single();
    if (error) return json({ error: error.message }, 500);
    return json({ ok: true, id: data.id });
  }

  if (req.method === "GET") {
    const { data, error } = await db.from("items")
      .select("id,title,due,list,context,project")
      .eq("user_id", OWNER).not("due", "is", null).neq("list", "done");
    if (error) return json({ error: error.message }, 500);
    return json(data);
  }

  return json({ error: "method not allowed" }, 405);
});
