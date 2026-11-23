# GTD

A small Getting Things Done app with:

- **Web app** (`index.html`): inbox, next actions, waiting for, someday, projects, contexts, due dates, weekly review. Synced through Supabase, so it works on phone and laptop.
- **Email capture**: forward any email to `you+gtd@gmail.com` and it lands in the inbox with a link back to the email.
- **Calendar**: items with a due date show up in a "GTD" Google Calendar.
- **Siri quick capture**: "Hey Siri, capture" → dictate → inbox.
- **MCP server**: Claude can add, list and update your items.

```
iPhone Shortcut ─┐
Gmail (Apps Script) ─┼─► Supabase function "gtd" ─┐
Claude (MCP) ──► Supabase function "gtd-mcp" ──────┼─► items table ◄── web app
Google Calendar ◄── Apps Script ◄── "gtd" (GET) ───┘
```

Setup takes about 30 minutes. Do the steps in order.

---

## 1. Database (Supabase)

1. Open your Supabase project → **SQL Editor** → **New query**.
2. Paste all of `supabase/schema.sql` and click **Run**.
3. Go to **Project Settings → API** and copy the **Project URL** and the **anon public** key.

## 2. Web app (GitHub Pages)

1. In `index.html`, replace `SUPABASE_URL` and `SUPABASE_ANON_KEY` with the values from step 1.3. (The anon key is safe to publish; the database only shows each user their own rows.)
2. Push the repo, then in GitHub go to **Settings → Pages**, set **Source: Deploy from a branch**, branch `main`, folder `/ (root)`.
3. Your app is at `https://<your-github-name>.github.io/<repo-name>/`.
4. In Supabase go to **Authentication → URL Configuration** and set **Site URL** to that address (also add it under **Redirect URLs**).

## 3. Sign in and lock it down

1. Open the app, enter your email, click the link you receive.
2. In Supabase go to **Authentication → Users** and copy your **User UID**. You need it in step 4.
3. In **Authentication → Sign In / Providers**, turn off **Allow new users to sign up**, so nobody else can create an account.

## 4. Functions (capture + MCP)

Make a secret key: a long random string, at least 32 characters (a password manager can generate one, or run `openssl rand -hex 24`). This one key protects Siri, Gmail and MCP access.

**In the dashboard** (no install needed):

1. **Edge Functions → Secrets**: add `GTD_KEY` = your secret key, and `OWNER_ID` = your User UID.
2. **Edge Functions → Deploy a new function → Via Editor**. Name it `gtd`, paste `supabase/functions/gtd/index.ts`, deploy.
3. Do the same for `gtd-mcp` with `supabase/functions/gtd-mcp/index.ts`.
4. Open each function's **Details** and turn **off** "Enforce JWT verification" (the functions check `GTD_KEY` themselves).

**Or with the Supabase CLI**:

```bash
supabase link --project-ref <your-project-ref>
supabase secrets set GTD_KEY=<your-key> OWNER_ID=<your-user-uid>
supabase functions deploy gtd --no-verify-jwt
supabase functions deploy gtd-mcp --no-verify-jwt
```

**Test it:**

```bash
curl -X POST https://<project>.supabase.co/functions/v1/gtd \
  -H "x-key: <your-key>" -H "content-type: application/json" \
  -d '{"title":"Test from curl","source":"curl"}'
```

Reload the app. "Test from curl" should be in the inbox.

## 5. Gmail capture + Google Calendar (Apps Script)

1. Go to <https://script.google.com> → **New project**, name it "GTD".
2. Replace the code with `apps-script/Code.gs`.
3. Fill in `API` (`https://<project>.supabase.co/functions/v1/gtd`), `KEY`, and `ADDRESS` (your Gmail with `+gtd`, e.g. `santi+gtd@gmail.com`).
4. Choose `setup` in the function dropdown and click **Run**. Allow the permissions Google asks for (Gmail, Calendar, external requests). Google warns the app is unverified because you wrote it yourself: click **Advanced → Go to GTD**.

Now:
- Any email you forward to `you+gtd@gmail.com` appears in the inbox within 5 minutes, with an "open" link to the email. Captured threads get the Gmail label `gtd-captured`.
- Items with a due date appear in a new **GTD** calendar within 15 minutes. That calendar shows up on your iPhone too if your Google account is in iOS Calendar.

## 6. Siri quick capture (iPhone Shortcuts)

In the **Shortcuts** app, tap **+** and add these actions:

1. **Ask for Input**: type *Text*, prompt "What's on your mind?"
2. **Get Contents of URL**:
   - URL: `https://<project>.supabase.co/functions/v1/gtd`
   - Method: **POST**
   - Headers: `x-key` = your key
   - Request Body: **JSON**, field `title` (Text) = *Provided Input*, field `source` (Text) = `siri`
3. **Show Notification**: "Captured" (optional)

Name the shortcut **Capture**. Then:
- "Hey Siri, capture" asks what to add, and you can dictate.
- **Settings → Action Button → Shortcut → Capture** (iPhone 15 Pro and newer).
- **Settings → Accessibility → Touch → Back Tap → Double Tap → Capture**.
- Add it as a home-screen or lock-screen widget.

**Put the app on your home screen:** open the app in Safari → Share → **Add to Home Screen**.

## 7. Claude (MCP connector)

In Claude: **Settings → Connectors → Add custom connector**.

- Name: `GTD`
- URL: `https://<project>.supabase.co/functions/v1/gtd-mcp?key=<your-key>`

Then you can ask Claude things like "add 'renew passport' to my next actions @errands", "what's in my GTD inbox?" or "mark #12 as done".

The key is part of that URL, so treat the URL like a password. If it leaks, change `GTD_KEY` in Supabase and update the Shortcut, Apps Script and connector.

---

## Files

| File | What it is |
|---|---|
| `index.html` | The web app |
| `supabase/schema.sql` | Database tables and access rules |
| `supabase/functions/gtd/index.ts` | Capture API: `POST` adds to inbox, `GET` lists dated items |
| `supabase/functions/gtd-mcp/index.ts` | MCP server with `add_item`, `list_items`, `update_item` |
| `supabase/config.toml` | Turns off JWT checks for both functions |
| `apps-script/Code.gs` | Gmail capture and calendar sync |

You can also add items with a link: `https://<your-app>/?add=Call%20dentist`.
