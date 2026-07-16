# Artifacts - Project Templates via Chat

Artifacts are reusable prompt templates for construction workflows (bid scope, takeoffs, schedule extraction, and more). **The primary way to run an artifact is through project chat**, where the full project knowledge base is available.

---

## Primary workflow: Run an artifact in project chat

```
1. Open the sidebar Projects section
2. Expand a project and click an artifact template
3. Project chat opens with the template active
4. Select sources and project artifacts for context (or use defaults)
5. Send the prefilled message (edit if needed)
6. Review the grounded response with citations
7. Save the response as a project artifact
```

Artifact templates are managed under **Manage → Artifacts** (`/artifact-templates`; legacy `/artifacts`). You can also test a template in the playground (`POST /artifact-templates/execute`); primary use is still project chat with save-as-artifact.

---

## When to Use Artifacts vs Chat

| Use artifact template in chat when | Use freeform chat when |
|-------------------------------------|------------------------|
| Structured output from a known template | Exploratory conversation |
| Cross-document project analysis | Quick one-off questions |
| Saving repeatable deliverables as project artifacts | Iterating without a fixed format |

---

## Playground: Test a template on sample text

Use **Manage → Artifacts** playground to run a template on pasted text. Output is returned immediately — save useful results as a project artifact from chat when you want them in the knowledge base.

---

## When to Use Artifacts (repeatable templates)

| Use Artifacts When | Use Chat Instead When |
|-------------------------|----------------------|
| Same analysis on many sources | One-off questions |
| Consistent output format needed | Exploratory conversation |
| Batch processing | Follow-up questions needed |
| Creating structured project artifacts | Context changes between questions |

**Example**: You have 10 papers and want a summary of each. Artifact does it in one operation.

---

## Quick Start: Your First Artifact (project chat)

```
1. Open a project from the sidebar (expand to see artifact templates)
2. Click a template (e.g., "Bid Scope Summary")
3. In project chat, confirm context selections include relevant sources
4. Send the message
5. Click Save on the AI response to create a project artifact
```

---

## Quick Start: Test in the playground

```
1. Go to Manage → Artifacts
2. Open a template (or create one)
3. Paste sample text in the playground
4. Run the artifact and review the output
5. For project work, run the same template from project chat and save as a project artifact
```

---

## Built-in Artifacts

Construction OS includes ready-to-use templates:

### Summary

```
What it does: Creates a 200-300 word overview
Output: Key points, main arguments, conclusions
Best for: Quick reference, getting the gist
```

### Key Concepts

```
What it does: Extracts main ideas and terminology
Output: List of concepts with explanations
Best for: Learning new topics, building vocabulary
```

### Methodology

```
What it does: Extracts research approach
Output: How the study was conducted
Best for: Academic papers, research review
```

### Takeaways

```
What it does: Extracts actionable takeaways
Output: What you should do with this information
Best for: Business documents, practical guides
```

### Questions

```
What it does: Generates questions the source raises
Output: Open questions, gaps, follow-up research
Best for: Literature review, research planning
```

---

## Creating Custom Artifacts

### Step-by-Step

```
1. Go to "Artifacts" page
2. Click "Create New"
3. Enter a name: "Academic Paper Analysis"
4. Write your prompt template:

   "Analyze this academic paper and extract:

   1. **Research Question**: What problem does this address?
   2. **Hypothesis**: What did they predict?
   3. **Methodology**: How did they test it?
   4. **Key Findings**: What did they discover? (numbered list)
   5. **Limitations**: What caveats do the authors mention?
   6. **Future Work**: What do they suggest next?

   Be specific and cite page numbers where possible."

5. Click "Save"
6. Your artifact appears in the list
```

### Prompt Template Tips

**Be specific about format:**
```
Good: "List 5 key points as bullet points"
Bad: "What are the key points?"
```

**Request structure:**
```
Good: "Create sections for: Summary, Methods, Results"
Bad: "Tell me about this paper"
```

**Ask for citations:**
```
Good: "Cite page numbers for each claim"
Bad: (no citation request)
```

**Set length expectations:**
```
Good: "In 200-300 words, summarize..."
Bad: "Summarize this"
```

---

## Applying Artifacts

### To a Single Source

```
1. In Sources panel, click source menu (⋮)
2. Select "Transform"
3. Choose artifact template
4. Click "Apply"
5. Project artifact appears when done
```

### To Multiple Sources (Batch)

```
1. Go to Artifacts page
2. Select your template
3. Check multiple sources
4. Click "Apply to Selected"
5. Processing runs in parallel
6. One project artifact per source created
```

### Processing Time

| Sources | Typical Time |
|---------|--------------|
| 1 source | 30 seconds - 1 minute |
| 5 sources | 2-3 minutes |
| 10 sources | 4-5 minutes |
| 20+ sources | 8-10 minutes |

Processing runs in background. You can continue working.

---

## Artifact Examples

### Literature Review Template

```
Name: Literature Review Entry

Prompt:
"For this research paper, create a literature review entry:

**Citation**: [Author(s), Year, Title, Journal]
**Research Question**: What problem is addressed?
**Methodology**: What approach was used?
**Sample**: What population/data was studied?
**Key Findings**:
1. [Finding with page citation]
2. [Finding with page citation]
3. [Finding with page citation]
**Strengths**: What did this study do well?
**Limitations**: What are the gaps?
**Relevance**: How does this connect to my research?

Keep each section to 2-3 sentences."
```

### Meeting Notes Template

```
Name: Meeting Summary

Prompt:
"From this meeting transcript, extract:

**Attendees**: Who was present
**Date/Time**: When it occurred
**Key Decisions**: What was decided (numbered)
**Action Items**:
- [ ] Task (Owner, Due Date)
**Open Questions**: Unresolved issues
**Next Steps**: What happens next

Format as clear, scannable notes."
```

### Competitor Analysis Template

```
Name: Competitor Analysis

Prompt:
"Analyze this company/product document:

**Company**: Name and overview
**Products/Services**: What they offer
**Target Market**: Who they serve
**Pricing**: If available
**Strengths**: Competitive advantages
**Weaknesses**: Gaps or limitations
**Opportunities**: How we compare
**Threats**: What they do better

Be objective and cite specific details."
```

### Technical Documentation Template

```
Name: API Documentation Summary

Prompt:
"Extract from this technical document:

**Overview**: What does this do? (1-2 sentences)
**Authentication**: How to authenticate
**Key Endpoints**:
- Endpoint 1: [method] [path] - [purpose]
- Endpoint 2: ...
**Common Parameters**: Frequently used params
**Rate Limits**: If mentioned
**Error Codes**: Key error responses
**Example Usage**: Simple code example if possible

Keep technical but concise."
```

---

## Managing Artifacts

### Edit a Artifact

```
1. Go to Artifacts page
2. Find your template
3. Click "Edit"
4. Modify the prompt
5. Click "Save"
```

### Delete a Artifact

```
1. Go to Artifacts page
2. Find the template
3. Click "Delete"
4. Confirm
```

### Reorder/Organize

Built-in artifacts appear first, then custom ones alphabetically.

---

## Artifact Output

### Where Results Go

- Each source produces one project artifact
- Artifacts appear in your project's Artifacts panel
- Artifacts are tagged with template name
- Original source is linked

### Artifact naming

```
Default: "[Artifact Name] - [Source Title]"
Example: "Summary - Research Paper 2025.pdf"
```

### Editing Output

```
1. Click the generated project artifact
2. Click "Edit"
3. Refine the content
4. Save
```

---

## Best Practices

### Template Design

1. **Start specific** - Vague prompts give vague results
2. **Use formatting** - Headings, bullets, numbered lists
3. **Request citations** - Make results verifiable
4. **Set length** - Prevent overly long or short output
5. **Test first** - Run on one source before batch

### Source Selection

1. **Similar content** - Same artifact on similar sources
2. **Reasonable size** - Very long sources may need splitting
3. **Processed status** - Ensure sources are fully processed

### Quality Control

1. **Review samples** - Check first few outputs before trusting batch
2. **Edit as needed** - Artifacts are starting points
3. **Iterate prompts** - Refine based on results

---

## Common Issues

### Generic Output

**Problem**: Results are too vague
**Solution**: Make prompt more specific, add format requirements

### Missing Information

**Problem**: Key details not extracted
**Solution**: Explicitly ask for what you need in prompt

### Inconsistent Format

**Problem**: Each project artifact looks different
**Solution**: Add clear formatting instructions to prompt

### Too Long/Short

**Problem**: Output doesn't match expectations
**Solution**: Specify word count or section lengths

### Processing Fails

**Problem**: Artifact doesn't complete
**Solution**:
- Check source is processed
- Try shorter/simpler prompt
- Process sources individually

---

## Artifacts vs. Chat vs. Ask

| Feature | Artifacts | Chat | Ask |
|---------|----------------|------|-----|
| **Input** | Predefined template | Your questions | Your question |
| **Scope** | One source at a time | Selected sources | Auto-searched |
| **Output** | Structured project artifact | Conversation | Comprehensive answer |
| **Best for** | Batch processing | Exploration | One-shot answers |
| **Follow-up** | Run again | Ask more | New query |

---

## Summary

```
Artifacts = Batch AI Processing

How to use:
1. Define template (or use built-in)
2. Select sources
3. Apply artifact
4. Get structured project artifacts

When to use:
- Same analysis on many sources
- Consistent output needed
- Building structured knowledge base
- Saving time on repetitive tasks

Tips:
- Be specific in prompts
- Request formatting
- Test before batch
- Edit output as needed
```

Artifacts turn repetitive analysis into one-click operations. Define once, apply many times.
