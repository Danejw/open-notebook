# Collections

Collections are curated lists of **string items** you can attach to project or source chat — similar to Skills, but focused on reusable reference values (URLs, NAICS codes, keywords, notes) rather than instruction files.

## What Collections are for

Use a collection when you want a stable set of values available in chat or for Opportunity Hub sync filters:

- State licensing boards and `.gov` authorities (as URLs)
- NAICS or other classification codes
- Keywords, notes, or other plain-text references

Collections appear in the sidebar under **Collections** (below Tools). In chat, use the **Collections** picker (library icon) next to Skills and Tools. On the Opportunity Hub, pick a collection before Sync to filter SAM.gov by item values (e.g. NAICS codes).

## Create a collection

1. Open **Collections** from the sidebar.
2. Click **Create Collection** or **Upload ZIP**.
3. Enter a name, description, and items as **comma-separated values** (new lines also work), for example: `236220, 238210, 237310`.
4. Open the collection detail page to edit metadata, add items, enable/disable entries, and validate.

### Import / export

Packages follow the same idea as Skills:

```
my-collection/
  COLLECTION.md    # YAML frontmatter + optional prose
  items.yaml       # ordered items
```

Use **Upload ZIP** on the library page or **Export ZIP** on the detail page for round-trip editing.

## Attach collections in chat

1. Open **project chat** or **source chat**.
2. Click the **Collections** icon in the composer (after Tools).
3. Select one or more active collections and save.
4. Send your message.

Selected collections are stored on the chat session and restored when you switch back to that session.

When a message runs, the assistant receives an **ACTIVE COLLECTIONS** block with each collection’s description and enabled items (capped by `selection.max_items`, default 12). Progress shows **Loading collections…** while context is prepared.

## Item fields

| Field | Purpose |
| --- | --- |
| **Value (title)** | The string stored and cited in chat / used as a sync filter |
| **URL** | Optional; set automatically when the value looks like `http(s)://…`. Required only for legacy `type: url` items |
| **Enabled** | Disabled items are stored but not injected into chat or used for sync filters |
| **Priority** | Higher priority items load first when capped |

## Validation

Click **Validate** on a collection detail page to check manifest rules. URL safety checks apply only to items with `type: url`. Fix any reported issues before relying on the collection in production chat.

## Current limitations

- **Explicit attach only** — you choose collections in the picker; the AI does not auto-select them from `use_when` yet (that metadata is stored for future use).
- **All enabled items** in a selected collection are loaded (up to the cap), not a per-message subset.
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

Pair with an `items.yaml` listing enabled string items (codes or URLs), import the ZIP, attach the collection in chat, and ask a related question to verify context loading.
