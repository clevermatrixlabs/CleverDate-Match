---
name: Wouter nest route absolute paths
description: Inside a wouter nest() route context, how to write Link hrefs that navigate to absolute paths
---

## Rule
Inside a `<Route path="/app" nest>` context in wouter v3, any `href` starting with `/` is treated **relative** to the nest base. So `href="/app/messages"` navigates to `/app/app/messages` — wrong.

**Use the `~` prefix to force absolute paths from the site root:**
- `href="~/app/messages"` → navigates to `/app/messages` ✓
- `href="~/admin"` → navigates to `/admin` ✓

**Why:** Wouter v3 nest context strips the parent path prefix from location and resolves child hrefs relative to the remaining path. The `~` prefix bypasses this and uses the true browser URL root.

**How to apply:** Any `Link` or navigation call inside a `nest`-ed Route (including components rendered by the nested Layout) must use `~/...` for absolute-path navigation. Also applies to `useLocation`-based `navigate()` calls.
