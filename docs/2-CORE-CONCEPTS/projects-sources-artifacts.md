# Projects, Sources, and Artifacts - The Container Model

Construction OS organizes research in three connected layers. Understanding this hierarchy is key to using the system effectively.

## The Three-Layer Structure

```
┌─────────────────────────────────────┐
│         PROJECT (The Container)     │
│     "My AI Safety Research 2026"   │
├─────────────────────────────────────┤
│                                     │
│  SOURCES (The Raw Materials)        │
│  ├─ safety_paper.pdf                │
│  ├─ alignment_video.mp4             │
│  └─ prompt_injection_article.html   │
│                                     │
│  ARTIFACTS (Processed Outputs)      │
│  ├─ AI Summary (ai)                 │
│  ├─ Key Concepts (generated)        │
│  ├─ My Research Notes (manual)      │
│  └─ Chat Capture (from conversation)│
│                                     │
└─────────────────────────────────────┘
```

---

## 1. PROJECTS - The Research Container

### What Is a Project?

A **project** is a *scoped container* for a research project or topic. It's your research workspace.

Think of it like a physical project: everything inside is about the same topic, shares the same context, and builds toward the same goals.

### What Goes In?

- **A description** — "This project collects research on X topic"
- **Sources** — The raw materials you add
- **Project artifacts** — Your analysis and outputs (stored in the `note` table; IDs remain `note:…`)
- **Conversation history** — Your chats and questions

### Why This Matters

**Isolation**: Each project is completely separate. Sources in Project A never appear in Project B. This lets you:
- Keep different research topics completely isolated
- Reuse source names across projects without conflicts
- Control which AI context applies to which research

**Shared Context**: All sources and artifacts in a project inherit the project's context. If your project is titled "AI Safety 2026" with description "Focusing on alignment and interpretability," that context applies to all AI interactions within that project.

**Parallel Projects**: You can have 10 projects running simultaneously. Each one is its own isolated research environment.

### Example

```
Project: "Customer Research - Product Launch"
Description: "User interviews and feedback for Q1 2026 launch"

→ All sources added to this project are about customer feedback
→ All artifacts generated are in that context
→ When you chat, the AI knows you're analyzing product launch feedback
→ Different from your "Market Analysis - Competitors" project
```

---

## 2. SOURCES - The Raw Materials

### What Is a Source?

A **source** is a *single piece of input material* — the raw content you bring in. Sources never change; they're just processed and indexed.

### What Can Be a Source?

- **PDFs** — Research papers, reports, documents
- **Web links** — Articles, blog posts, web pages
- **Audio files** — Podcasts, interviews, lectures
- **Video files** — Tutorials, presentations, recordings
- **Plain text** — Notes, transcripts, passages
- **Uploaded text** — Paste content directly

### What Happens When You Add a Source?

```
1. EXTRACTION
   File/URL → Extract text and metadata
   (OCR for PDFs, web scraping for URLs, speech-to-text for audio)

2. CHUNKING
   Long text → Break into searchable chunks
   (Prevents "too much context" in single query)

3. EMBEDDING
   Each chunk → Generate semantic vector
   (Allows AI to find conceptually similar content)

4. STORAGE
   Chunks + vectors → Store in database
   (Ready for search and retrieval)
```

### Key Properties

**Immutable**: Once added, the source doesn't change. If you need a new version, add it as a new source.

**Indexed**: Sources are automatically indexed for search (both text and semantic).

**Scoped**: A source belongs to exactly one project.

**Referenceable**: Other sources and artifacts can reference this source by citation.

### Example

```
Source: "openai_charter.pdf"
Type: PDF document

What happens:
→ PDF is uploaded
→ Text is extracted (including images)
→ Text is split into 50 chunks (paragraphs, sections)
→ Each chunk gets an embedding vector
→ Now searchable by: "OpenAI's approach to safety"
```

---

## 3. PROJECT ARTIFACTS - Processed Outputs

### What Is a Project Artifact?

A **project artifact** is a *processed output* — something you created or AI created based on your sources. Artifacts are the "results" of your research work.

> **Naming note:** The domain model is `ProjectArtifact`. In the database, records still live in the Surreal `note` table with IDs like `note:abc123`. The API is `/api/project-artifacts` (legacy `/api/notes` aliases remain for compatibility).

### Project Artifact vs Artifact Template

| Concept | Purpose | Storage | Example |
|---------|---------|---------|---------|
| **Project artifact** | A saved output inside a project | `note` table (`note:…`) | Bid scope summary you saved from chat |
| **Artifact template** | A reusable prompt in the global library | `artifact` table | "Bid Scope Summary" template under Manage → Artifacts |

Running an **artifact template** in project chat produces content you can save as a **project artifact**.

### Kinds of Project Artifacts

Stored in the `note_type` column (API field: `artifact_kind`):

| Kind | Meaning | Typical origin |
|------|---------|----------------|
| `manual` | You wrote it | Create artifact, edit in project |
| `ai` | AI-generated from chat or Ask | Save response from conversation |
| `generated` | Structured output from a template | Artifact template run in project chat |

Legacy values (`human`, `note`, `artifact`) are normalized to these kinds by migration 42.

### What Can Artifacts Contain?

- **Text** — Your writing or AI-generated content
- **Citations** — References to specific sources
- **Metadata** — When created, kind (`manual` / `ai` / `generated`), which sources influenced it
- **Tags** — Your categorization (optional but useful)

### Why Artifacts Matter

**Knowledge Accumulation**: Artifacts become your actual knowledge base. They're what you take away from the research.

**Searchable**: Artifacts are searchable along with sources. "Find everything about X" includes your artifacts, not just sources.

**Citable**: Artifacts can cite sources, creating an audit trail of where findings came from.

**Shareable**: Artifacts are your outputs. You can export generated artifacts as PDF, share them, or promote them back into sources.

---

## How They Connect: The Data Flow

```
YOU
 │
 ├─→ Create Project ("AI Research")
 │
 ├─→ Add Sources (papers, articles, videos)
 │    └─→ System: Extract, embed, index
 │
 ├─→ Search Sources (text or semantic)
 │    └─→ System: Find relevant chunks
 │
 ├─→ Run Artifact Templates (structured extracts → project artifacts)
 │    └─→ Creates generated artifacts
 │
 ├─→ Chat with Sources (explore with context control)
 │    ├─→ Can save responses as ai artifacts
 │    └─→ Artifacts include citations
 │
 ├─→ Ask Questions (automated comprehensive search)
 │    ├─→ Can save results as ai artifacts
 │    └─→ Artifacts include citations
 │
 └─→ Generate Podcast (transform project into audio)
     └─→ Uses all sources + artifacts for content
```

---

## Key Design Decisions

### 1. One Project Per Source

Each source belongs to exactly one project. This creates clear boundaries:
- No ambiguity about which research project a source is in
- Easy to isolate or export a complete project
- Clean permissions model (if someone gets access to project, they get access to all its sources)

### 2. Immutable Sources, Mutable Artifacts

Sources never change (once added, always the same). But project artifacts can be edited or deleted. Why?
- Sources are evidence → evidence shouldn't be altered
- Artifacts are your thinking → thinking evolves as you learn

### 3. Explicit Context Control

Sources don't automatically go to AI. You decide which sources and artifacts are "in context" for each interaction:
- Chat: You manually select which sources and artifacts to include
- Ask: System automatically figures out which sources to search
- Artifact templates: You choose which sources to transform

This is different from systems that always send everything to AI.

---

## Mental Models Explained

### Project as Boundaries
Think of a project like a Git repository:
- Everything in it is about the same topic
- You can clone/fork it (copy to new project)
- It has clear entry/exit points
- You know exactly what's included

### Sources as Evidence
Think of sources like exhibits in a legal case:
- Once filed, they don't change
- They can be cited and referenced
- They're the ground truth for what you're basing claims on
- Multiple sources can be cross-referenced

### Artifacts as Synthesis
Think of project artifacts like your case brief:
- You write them based on evidence
- They're your interpretation
- You can cite which evidence supports each claim
- They're what you actually share or act on

---

## Common Questions

### Can I move a source to a different project?
Not directly. Each source is tied to one project. If you want it in multiple projects, add it again (uploads are fast if it's already processed).

### Can an artifact reference sources from a different project?
No. Artifacts stay within their project and reference sources within that project. This keeps boundaries clean.

### What if I want to group sources within a project?
Use tags. You can tag sources ("primary research," "background," "methodology") and filter by tags.

### Can I merge two projects?
Not built-in, but you can manually copy sources from one project to another by re-uploading them.

### Why do IDs still say `note:`?
The physical Surreal table name was kept as `note` for migration compatibility. The product language and API use "project artifact."

---

## Summary

| Concept | Purpose | Lifecycle | Scope |
|---------|---------|-----------|-------|
| **Project** | Container + context | Create once, configure | All its sources + artifacts |
| **Source** | Raw material | Add → Process → Store | One project |
| **Project artifact** | Processed output | Create/capture → Edit → Share | One project |
| **Artifact template** | Reusable prompt | Create → Run in chat | Global library |

This three-layer model gives you:
- **Clear organization** (everything scoped to projects)
- **Privacy control** (isolated projects)
- **Audit trails** (artifacts cite sources)
- **Flexibility** (artifacts can be manual, ai, or generated)
