# Collections

Collections are curated lists of reference URLs you can attach to project or source chat — similar to Skills, but focused on **link bundles** (official sites, code authorities, permit portals) rather than instruction files.

## What Collections are for

Use a collection when you want the AI to know about a stable set of external references:

- State licensing boards and `.gov` authorities
- County permit portals
- Standard reference sites for a trade or jurisdiction

Collections appear in the sidebar under **Collections** (below Tools). In chat, use the **Collections** picker (library icon) next to Skills and Tools.

## Create a collection

1. Open **Collections** from the sidebar.
2. Click **Create Collection** or **Upload ZIP**.
3. Enter a name, description, and one or more HTTPS URLs (one per line).
4. Open the collection detail page to edit metadata, add items, enable/disable entries, and validate.

### Import / export

Packages follow the same idea as Skills:

```
my-collection/
  COLLECTION.md    # YAML frontmatter + optional prose
  items.yaml       # ordered URL items
```

Use **Upload ZIP** on the library page or **Export ZIP** on the detail page for round-trip editing.

## Attach collections in chat

1. Open **project chat** or **source chat**.
2. Click the **Collections** icon in the composer (after Tools).
3. Select one or more active collections and save.
4. Send your message.

Selected collections are stored on the chat session and restored when you switch back to that session.

When a message runs, the assistant receives an **ACTIVE COLLECTIONS** block with each collection’s description and enabled URL items (capped by `selection.max_items`, default 12). Progress shows **Loading collections…** while context is prepared.

## Item fields

| Field | Purpose |
| --- | --- |
| **Title** | Display name cited in chat |
| **URL** | HTTPS (or HTTP) link; validated on save |
| **Enabled** | Disabled items are stored but not injected into chat |
| **Priority** | Higher priority items load first when capped |

## Validation

Click **Validate** on a collection detail page to check manifest rules and URL safety (same strict checks as MCP URL tools). Fix any reported issues before relying on the collection in production chat.

## Current limitations

- **Explicit attach only** — you choose collections in the picker; the AI does not auto-select them from `use_when` yet (that metadata is stored for future use).
- **URL items only** in chat context — other item types (`note`, `query`, etc.) can be stored but are not injected in this release.
- **All enabled URLs** in a selected collection are loaded (up to the cap), not a per-message subset.
- **No project-level attachment** — collections attach to the chat session, not permanently to a project.
- **Instance visibility** — same scope model as Skills today (`visibility: instance`).

## Example

```yaml
---
id: hawaii-construction-authorities
name: Hawaii Construction Authorities
type: collection
version: 1.0.0
description: Official Hawaii construction licensing and permitting sources.
use_when:
  - Researching Hawaii contractor licensing
tags: [hawaii, official-sources]
selection:
  max_items: 12
visibility: instance
status: active
---
```

Pair with an `items.yaml` listing 3–5 enabled `.gov` HTTPS URLs, import the ZIP, attach the collection in chat, and ask about Hawaii contractor licensing to verify context loading.
