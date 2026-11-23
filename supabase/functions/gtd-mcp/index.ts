// Minimal MCP server (streamable HTTP, stateless, JSON responses).
// URL to add in Claude:  https://<project>.supabase.co/functions/v1/gtd-mcp?key=<GTD_KEY>

import { createClient } from "npm:@supabase/supabase-js@2";

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const KEY = Deno.env.get("GTD_KEY");
const OWNER = Deno.env.get("OWNER_ID");
const LISTS = ["inbox", "next", "waiting", "someday", "projects", "done"];

const str = { type: "string" };
const TOOLS = [
  {
    name: "add_item",
    description: "Add a GTD item. Defaults to the inbox. Contexts look like @home, @work, @phone, @computer, @errands.",
    inputSchema: {
      type: "object",
      properties: {
        title: str, list: { type: "string", enum: LISTS }, context: str, project: str,
        due: { type: "string", description: "YYYY-MM-DD" }, notes: str,
      },
      required: ["title"],
    },
  },
  {
    name: "list_items",
    description: "List GTD items, optionally filtered by list, context or project. Done items are hidden unless list is 'done'.",
    inputSchema: { type: "object", properties: { list: { type: "string", enum: LISTS }, context: str, project: str } },
  },
  {
    name: "update_item",
    description: "Change an item by id: rename, move to another list (use 'done' to complete), set context, project or due date.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "number" }, title: str, list: { type: "string", enum: LISTS }, context: str, project: str,
        due: { type: "string", description: "YYYY-MM-DD, or empty to clear" }, notes: str,
      },
      required: ["id"],
    },
  },
];

// deno-lint-ignore no-explicit-any
async function callTool(name: string, a: any): Promise<string> {
  if (name === "add_item") {
    const { data, error } = await db.from("items").insert({
      user_id: OWNER, title: a.title, list: a.list ?? "inbox", context: a.context ?? "",
      project: a.project ?? "", due: a.due || null, notes: a.notes ?? "", source: "claude",
    }).select("id").single();
    if (error) throw error;
    return `Added #${data.id}: ${a.title}`;
  }
  if (name === "list_items") {
    let q = db.from("items").select("*").eq("user_id", OWNER).order("created_at", { ascending: false });
    q = a.list ? q.eq("list", a.list) : q.neq("list", "done");
    if (a.context) q = q.eq("context", a.context);
    if (a.project) q = q.eq("project", a.project);
    const { data, error } = await q;
    if (error) throw error;
    if (!data.length) return "No items.";
    return data.map((i) =>
      [`#${i.id}`, `[${i.list}]`, i.title, i.context, i.project && `(project: ${i.project})`, i.due && `due ${i.due}`]
        .filter(Boolean).join(" ")
    ).join("\n");
  }
  if (name === "update_item") {
    const patch: Record<string, unknown> = {};
    for (const k of ["title", "list", "context", "project", "notes"]) if (a[k] !== undefined) patch[k] = a[k];
    if (a.due !== undefined) patch.due = a.due || null;
    const { error } = await db.from("items").update(patch).eq("id", a.id).eq("user_id", OWNER);
    if (error) throw error;
    return `Updated #${a.id}`;
  }
  throw new Error(`Unknown tool: ${name}`);
}

const reply = (id: unknown, result: unknown) =>
  new Response(JSON.stringify({ jsonrpc: "2.0", id, result }), { headers: { "content-type": "application/json" } });
const fail = (id: unknown, code: number, message: string) =>
  new Response(JSON.stringify({ jsonrpc: "2.0", id, error: { code, message } }), { headers: { "content-type": "application/json" } });

Deno.serve(async (req) => {
  if (!KEY || new URL(req.url).searchParams.get("key") !== KEY) return new Response("unauthorized", { status: 401 });
  if (req.method !== "POST") return new Response("method not allowed", { status: 405 });

  const msg = await req.json().catch(() => null);
  if (!msg || typeof msg !== "object") return fail(null, -32700, "Parse error");
  if (msg.id === undefined) return new Response(null, { status: 202 }); // notification

  switch (msg.method) {
    case "initialize":
      return reply(msg.id, {
        protocolVersion: msg.params?.protocolVersion ?? "2025-06-18",
        capabilities: { tools: {} },
        serverInfo: { name: "gtd", version: "1.0.0" },
      });
    case "ping":
      return reply(msg.id, {});
    case "tools/list":
      return reply(msg.id, { tools: TOOLS });
    case "tools/call":
      try {
        const text = await callTool(msg.params?.name, msg.params?.arguments ?? {});
        return reply(msg.id, { content: [{ type: "text", text }] });
      } catch (e) {
        return reply(msg.id, { content: [{ type: "text", text: `Error: ${(e as Error).message}` }], isError: true });
      }
    default:
      return fail(msg.id, -32601, `Method not found: ${msg.method}`);
  }
});
