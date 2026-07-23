# /knowledge-graph-quality-audit

Run this audit against the Construction OS repository.

Source: Auglet `knowledge-graph-quality-audit` (asset `eb67a07c-58df-4908-b068-4484cd97ad10`).

## Project notes

- Working directory: repo root (`construction-os`)
- Write the completed report to `docs/audits/knowledge-graph-quality-audit.md`
- Compare against any previous report at that path and preserve issue IDs when possible
- Do not modify application code or delete database data during the audit (read-only)
- Prefer live SurrealDB / API inspection when available

---

# Knowledge Graph Quality Audit

## Role

Act as a senior software architect, knowledge graph engineer, data quality specialist, and repository auditor specializing in **knowledge graph quality**.

Audit the repository thoroughly using source code, schemas, migrations, configuration, tests, documentation, generated graph data, database queries, runtime validators, telemetry, and repository-native analysis tools as evidence.

Do not modify files, schemas, records, or configuration during the audit. Your task is to investigate, score, and report.

Every verified issue must include a self-contained implementation prompt that another coding agent can copy and use to resolve that issue without needing the rest of the audit.

---

# Primary Objective

Measure whether the current knowledge graph accurately, consistently, and safely represents the underlying source information.

Evaluate ontology design, entity extraction, entity resolution, relationship construction, provenance, temporal reasoning, graph integrity, lifecycle behavior, retrieval usefulness, permission enforcement, observability, and regression protection.

Identify why the knowledge graph may:

* Omit important entities or relationships
* Create duplicate or fragmented nodes
* Merge unrelated entities
* Create unsupported or incorrect edges
* Lose source provenance
* Preserve stale facts
* Contradict newer information
* Return misleading relational context
* Expose information across project or permission boundaries
* Accumulate corruption as sources are updated or deleted
* Fail to support reliable Graph RAG, reasoning, search, or automation

Evaluate the repository in both directions:

1. Determine whether the implementation follows the intended knowledge graph standards, schemas, contracts, and documented architecture.
2. Detect important implementation behavior, risk, or data semantics that are missing from the intended standards, documentation, tests, or safeguards.

Do not automatically assume that the current code, schema, graph data, documentation, or tests are correct.

When evidence conflicts, determine whether the implementation, schema, configuration, documentation, tests, or intended contract should change.

Mark ambiguous ontology, ownership, business meaning, destructive migration, or relationship-semantics decisions for human review instead of guessing.

---

# Audit Scope

Inspect all relevant areas, including where present:

* Source-to-graph ingestion
* Document parsing and extraction
* Entity and concept extraction
* Node creation
* Entity normalization
* Entity resolution and deduplication
* Canonical identifiers
* Aliases and name variants
* Ontology and schema design
* Node types and property definitions
* Edge types and relationship semantics
* Relationship directionality
* Cardinality and uniqueness constraints
* Provenance and source attribution
* Evidence spans and source references
* Confidence values
* Temporal validity
* Fact creation timestamps
* Source event timestamps
* Effective dates and expiration dates
* Supersession and version history
* Contradiction handling
* Merge, update, supersede, and deletion behavior
* Orphaned nodes and dangling edges
* Duplicate nodes and duplicate relationships
* Graph traversal
* Graph search and retrieval
* Graph RAG integration
* Context assembly
* Access control and project isolation
* Generated graph views and debugging interfaces
* Evaluation datasets
* Graph quality metrics
* Monitoring and operational safeguards
* Database schemas, migrations, jobs, triggers, workers, queues, and scheduled maintenance
* Administrative correction and review workflows

Also inspect repository-specific conventions, generated code, dynamic registration, framework behavior, external entry points, graph database behavior, background jobs, deployment configuration, and runtime services when they could change a conclusion.

Exclude third-party internals unless they are copied, vendored, configured, wrapped, extended, or directly responsible for a repository-level issue.

Do not treat general RAG quality as the primary subject of this audit. Evaluate retrieval and answer behavior only where graph quality, graph traversal, graph context, or graph permissions directly affect the result.

---

# Required Investigation Process

1. Map the complete knowledge graph lifecycle from source ingestion through graph construction, retrieval, maintenance, and deletion.
2. Identify the authoritative ontology, schema, and relationship contracts.
3. Inspect representative source records and trace them into generated nodes, edges, properties, provenance records, and timestamps.
4. Inspect representative nodes and edges and trace them back to supporting source evidence.
5. Evaluate entity extraction using realistic positive, ambiguous, duplicate, and negative cases.
6. Evaluate entity resolution across spelling variants, aliases, abbreviations, revisions, and sources.
7. Evaluate relationship extraction for direction, type, support, confidence, and source fidelity.
8. Test update, replacement, merge, supersede, deletion, and re-ingestion paths.
9. Inspect graph integrity for orphaned nodes, dangling references, duplicates, invalid properties, invalid edge types, and broken constraints.
10. Evaluate temporal behavior when facts change, expire, conflict, or are superseded.
11. Evaluate graph retrieval using direct, multi-hop, temporal, relational, scoped, and negative queries.
12. Verify that permission and project filters apply before graph data reaches a model, user, agent, export, or downstream tool.
13. Separate extraction failure, normalization failure, entity-resolution failure, graph-construction failure, maintenance failure, retrieval failure, and generation failure.
14. Determine whether quality metrics and regression tests can detect future degradation.

Before reporting an issue, verify it using more than one signal whenever practical.

Evidence may include:

* Source references and imports
* Runtime validators and static types
* Ontology definitions
* Database schemas and migrations
* Constraints and indexes
* Graph queries
* Tests and fixtures
* Worker and queue behavior
* Configuration and deployment behavior
* Documentation and architectural decisions
* Route, job, plugin, tool, or event registration
* Generated graph records
* Provenance records
* Runtime logs and telemetry
* Admin interfaces
* Evaluation datasets and generated reports
* Downstream retrieval behavior

If a required graph database, runtime environment, production dataset, external service, private configuration, or historical graph state cannot be inspected, state the limitation and reduce the coverage confidence.

Do not invent graph records, command output, runtime behavior, or production evidence.

---

# Canonical Knowledge Graph Concepts

Determine which terms and operations the repository actually supports. Do not assume all of these exist.

Where present, evaluate:

* **Entity:** A uniquely identifiable object, person, organization, project, document, trade, product, location, requirement, component, event, or concept.
* **Node type:** The declared semantic category of an entity.
* **Canonical identity:** The stable identifier representing one real-world or domain object.
* **Alias:** An alternate label, spelling, abbreviation, identifier, or name for the same entity.
* **Relationship or edge:** A typed connection between two nodes.
* **Relationship evidence:** The source record, passage, field, or event supporting an edge.
* **Provenance:** Information identifying where a node, property, or relationship came from.
* **Confidence:** A bounded measure of extraction or resolution certainty.
* **Observed timestamp:** When the system processed or learned the information.
* **Source timestamp:** When the underlying source was authored, issued, modified, or recorded.
* **Valid time:** The period during which a fact is considered true.
* **Transaction time:** The period during which a graph record existed in the system.
* **Supersession:** A newer record replacing an older fact without erasing history.
* **Merge:** Multiple graph records being resolved into one canonical entity.
* **Delete:** Removal or invalidation of graph data according to source lifecycle and retention rules.
* **Contradiction:** Two claims that cannot safely be treated as simultaneously true within the same context and valid time.
* **Derived fact:** A fact inferred from other graph information rather than directly extracted.
* **Project boundary:** The ownership, tenant, workspace, or permission scope controlling graph access.

When the repository uses different terminology, map the repository terms to these concepts and identify the authoritative naming.

---

# Evidence Standard

Every issue must include:

* Exact file paths
* Exact symbols, routes, jobs, schemas, tables, collections, queries, indexes, constraints, components, configuration keys, or dependencies involved
* A concise explanation of the relevant behavior
* The evidence proving or strongly indicating the problem
* Searches, commands, queries, tests, or analysis used
* Representative graph records when safely available
* Important dynamic, generated, database, external, or framework behavior considered
* The likely authoritative implementation or contract
* Any uncertainty that affects the recommendation

Classify findings as:

* **Confirmed:** Direct repository, schema, test, query, or graph-record evidence establishes the issue.
* **Probable:** Strong evidence exists, but runtime, production-data, or external verification is still required.
* **Requires human review:** The intended ontology, ownership, destructive behavior, relationship semantics, external usage, or acceptable risk cannot be determined safely.

Do not place probable or uncertain estimates inside confirmed totals.

Do not classify a finding as Confirmed solely because a static-analysis tool emitted a warning.

---

# Knowledge Graph Quality Score

Calculate a single **Knowledge Graph Quality Score from 0 to 100**.

A score of 100 means the repository and inspected graph data have no meaningful quality issues within the verified audit scope and include effective safeguards against regression.

Use the same rubric and standards on every run so scores can be compared over time.

## Rating Scale

Rate every category from **0 to 5**:

* **5 - Excellent:** Complete, consistent, reliable, and well protected
* **4 - Good:** Minor isolated issues with limited risk
* **3 - Fair:** Useful and functional, but meaningful gaps remain
* **2 - Weak:** Multiple important problems or inconsistent practices
* **1 - Poor:** Substantial risk, drift, or unreliability
* **0 - Critical or absent:** The category is fundamentally unsafe, missing, or unusable

Calculate each weighted category using:

`Weighted category score = (rating ÷ 5) × category weight`

Round the final total to the nearest whole number.

The displayed weighted scores must reproduce the final score.

---

# Weighted Rubric

| Category                                       |  Weight | What to Measure                                                                                                                    |
| ---------------------------------------------- | ------: | ---------------------------------------------------------------------------------------------------------------------------------- |
| Ontology and Schema Quality                    |      15 | Node types, edge types, property definitions, constraints, directionality, cardinality, extensibility, and semantic clarity        |
| Extraction and Representation Accuracy         |      15 | Entity extraction, relationship extraction, source fidelity, confidence, normalization, and representation completeness            |
| Entity Resolution and Identity Integrity       |      15 | Canonical identifiers, alias handling, deduplication, merge safety, false merges, fragmentation, and identity stability            |
| Relationship and Graph Integrity               |      15 | Supported edges, valid endpoints, duplicate edges, dangling references, orphaned nodes, topology, and constraint enforcement       |
| Provenance and Explainability                  |      10 | Source attribution, evidence spans, confidence, derived-fact labeling, traceability, and correction paths                          |
| Temporal and Lifecycle Reliability             |      15 | Timestamps, valid time, freshness, updates, contradiction handling, supersession, deletion, re-ingestion, and history preservation |
| Retrieval, Isolation, and Operational Controls |      15 | Traversal quality, Graph RAG use, project isolation, permissions, evaluation, metrics, monitoring, and regression safeguards       |
| **Total**                                      | **100** |                                                                                                                                    |

---

# Grade Scale

|  Score | Grade |
| -----: | :---- |
| 95-100 | A+    |
|  90-94 | A     |
|  85-89 | B+    |
|  80-84 | B     |
|  75-79 | C+    |
|  70-74 | C     |
|  60-69 | D     |
|   0-59 | F     |

---

# Category Evaluation Requirements

## 1. Ontology and Schema Quality

Evaluate:

* Whether node and edge types have clear meanings
* Whether types overlap or conflict
* Whether relationships have defined directionality
* Whether properties have stable types and validation
* Whether required properties are enforced
* Whether identifiers are stable and deterministic where appropriate
* Whether cardinality and uniqueness rules are documented and enforced
* Whether schema evolution and migrations are safe
* Whether repository code and database schema agree
* Whether free-form types can bypass the intended ontology
* Whether generated or user-created types are controlled safely
* Whether deprecated types and properties are migrated or preserved intentionally
* Whether the model can create invalid semantic combinations
* Whether the ontology supports the actual domain questions the system is expected to answer

## 2. Extraction and Representation Accuracy

Evaluate:

* Whether important source information becomes graph data
* Whether extraction preserves the source meaning
* Whether extracted node types are correct
* Whether relationships are supported by source evidence
* Whether negative statements are incorrectly turned into positive facts
* Whether uncertain language is represented as certainty
* Whether tables, drawings, structured fields, and multimodal information are handled correctly
* Whether contextual qualifiers are lost
* Whether confidence values are meaningful and calibrated
* Whether extraction failures are observable
* Whether partial processing is marked clearly
* Whether source revisions produce consistent graph results

## 3. Entity Resolution and Identity Integrity

Evaluate:

* Whether the same entity is duplicated across sources
* Whether unrelated entities can be merged
* Whether aliases and abbreviations resolve correctly
* Whether canonical identifiers survive renames
* Whether project-local entities can collide with global entities
* Whether entity resolution considers type, context, source, location, time, and ownership
* Whether merge operations preserve provenance
* Whether merge operations are reversible or reviewable
* Whether deleted or superseded entities can reappear incorrectly
* Whether resolution confidence is available
* Whether low-confidence matches require review
* Whether canonicalization is deterministic and testable

## 4. Relationship and Graph Integrity

Evaluate:

* Whether edge direction is correct
* Whether edge types match endpoint types
* Whether relationships are duplicated
* Whether relationships have supporting evidence
* Whether deleted nodes leave dangling edges
* Whether orphaned nodes are intentional
* Whether graph cycles are allowed, prohibited, or meaningful
* Whether multi-hop paths preserve semantics
* Whether symmetric and inverse relationships behave correctly
* Whether derived edges can be distinguished from extracted edges
* Whether graph constraints run during all write paths
* Whether bulk imports and background jobs bypass validation
* Whether retries can create duplicate nodes or edges
* Whether transaction boundaries prevent partial graph updates

## 5. Provenance and Explainability

Evaluate:

* Whether each node can be traced to one or more sources
* Whether each property can be traced to evidence where required
* Whether each edge can be traced to supporting evidence
* Whether source document, page, section, passage, field, drawing reference, or record identifier is preserved
* Whether provenance survives merges and updates
* Whether generated or inferred facts are labeled
* Whether confidence and extraction method are recorded
* Whether users can inspect why a relationship exists
* Whether incorrect graph data can be reported and corrected
* Whether deletion of a source removes or invalidates dependent facts safely
* Whether citations represent actual support rather than only document presence

## 6. Temporal and Lifecycle Reliability

Evaluate:

* Whether timestamps are generated by trusted system clocks rather than model guesses
* Whether observed time and source time are distinguished
* Whether valid time and transaction time are represented where needed
* Whether updates replace, append, merge, or supersede facts consistently
* Whether conflicting facts are retained, ranked, reconciled, or reviewed intentionally
* Whether stale facts remain active after newer evidence arrives
* Whether re-ingestion is idempotent
* Whether deletions propagate correctly
* Whether source removal preserves required audit history
* Whether merged entities preserve historical identifiers
* Whether temporal queries return facts valid at the requested time
* Whether future-dated or malformed timestamps are detected
* Whether timezone behavior is explicit
* Whether background repair or consolidation processes are deterministic, observable, and recoverable

## 7. Retrieval, Isolation, and Operational Controls

Evaluate:

* Whether graph queries return relevant nodes and paths
* Whether direct, relational, multi-hop, temporal, and negative queries behave correctly
* Whether graph retrieval avoids semantically invalid paths
* Whether project, tenant, user, and permission filters apply before data reaches the model
* Whether graph traversal can cross ownership boundaries
* Whether hidden or deleted nodes remain retrievable
* Whether the graph improves downstream answers rather than adding unsupported context
* Whether retrieval explains which paths were used
* Whether large graph neighborhoods are bounded safely
* Whether traversal depth, cost, and timeout behavior are controlled
* Whether evaluation datasets include realistic graph cases
* Whether graph metrics are tracked over time
* Whether schema drift, duplicate growth, orphan growth, extraction failure, and stale-data accumulation are monitored
* Whether CI or deployment checks protect critical graph behavior
* Whether operational repair tools are safe and auditable

---

# Scoring Guardrails

* Do not award points merely because schemas, graph abstractions, validators, jobs, tools, tests, dashboards, or documentation exist.
* Award credit only when they are accurate, used, effective, and supported by evidence.
* Do not assume a graph database automatically guarantees semantic quality.
* Do not treat a large graph as a high-quality graph.
* Do not treat graph connectivity as proof of correctness.
* Do not reward the system for generating many relationships when those relationships lack evidence.
* Do not reduce the score for style preferences without a concrete reliability, semantic, operational, or maintenance impact.
* Weight incorrect identity merges, permission leaks, unsupported relationships, and destructive lifecycle errors heavily.
* Do not count the same root cause against multiple categories unless it independently affects each category.
* Do not increase a future score unless repository or graph evidence confirms that the underlying problem was resolved.
* Keep category weights unchanged between audit runs.
* Make all scoring calculations visible and reproducible.
* A high score with Partial or Limited coverage must not be presented as definitive.
* Score the implemented and verified behavior, not the intended roadmap.
* Treat missing production access as a coverage limitation, not automatic proof of correctness or failure.
* Do not infer graph accuracy from a small number of anecdotal queries.
* Do not assume every duplicate label represents a duplicate entity.
* Do not assume every disconnected node is an error.
* Do not recommend merging entities without evidence that they represent the same canonical object.

---

# Required Graph Quality Measurements

Calculate these measurements when the required graph data is available.

When a measurement cannot be calculated, state why.

## Structural Measurements

* Total node count by type
* Total edge count by type
* Nodes missing required properties
* Edges missing required properties
* Invalid endpoint-type combinations
* Dangling edges
* Orphaned nodes
* Self-referential edges
* Duplicate nodes
* Duplicate edges
* Nodes using unknown or deprecated types
* Edges using unknown or deprecated types
* Connected component count
* Unexpected isolated subgraphs
* Average and maximum degree
* High-degree outliers
* Failed constraint count
* Partial graph-write count when observable

## Provenance Measurements

* Percentage of nodes with source provenance
* Percentage of edges with source provenance
* Percentage of important properties with evidence
* Percentage of derived facts labeled as derived
* Percentage of graph records with extraction confidence
* Percentage of graph records traceable to an active source
* Records referencing missing or deleted sources
* Records with ambiguous source ownership

## Identity Measurements

* Candidate duplicate rate
* Confirmed duplicate rate
* Suspected false-merge count
* Alias coverage
* Canonical identifier coverage
* Low-confidence resolution count
* Cross-project identity collision count
* Merge operations without retained provenance
* Non-reversible or unaudited merge count

## Temporal Measurements

* Records without observed timestamps
* Records without source timestamps where required
* Invalid or future-dated timestamps
* Stale active facts
* Contradictory active facts
* Superseded facts still returned as current
* Deleted-source facts still active
* Re-ingestion duplication rate
* Update propagation failures
* Temporal queries returning incorrect validity windows

## Retrieval Measurements

* Direct entity lookup accuracy
* Alias lookup accuracy
* Relationship query precision
* Relationship query recall
* Multi-hop path validity
* Temporal query accuracy
* Negative-query behavior
* Permission-filter correctness
* Project-isolation correctness
* Unsupported path rate
* Retrieval result provenance coverage
* Graph-context contribution to downstream answer quality

Do not fabricate percentages when the necessary denominator cannot be established.

---

# Graph Evaluation Cases

Use repository-specific examples whenever possible.

At minimum, evaluate representative cases for:

1. Exact entity lookup
2. Alias or abbreviation lookup
3. Two entities with similar names
4. One entity appearing in multiple documents
5. One label representing different entities in different projects
6. Direct relationship lookup
7. Multi-hop relationship lookup
8. Relationship directionality
9. Negative or absent relationship
10. Contradictory source claims
11. A fact that changes over time
12. A superseded fact
13. A deleted source
14. Re-ingestion of an unchanged source
15. Re-ingestion of a modified source
16. Low-confidence extraction
17. Permission-restricted graph data
18. Cross-project traversal attempt
19. Unsupported relationship proposed by the model
20. Graph data used in a downstream answer

For every evaluated case, record:

* Input source or query
* Expected result
* Actual result
* Relevant nodes and edges
* Provenance
* Permission scope
* Temporal scope
* Pass, fail, or unverified status
* Evidence supporting the conclusion

---

# Coverage Confidence

Assign one coverage label:

* **Comprehensive:** Nearly all relevant repository areas, graph data, runtime behavior, and evidence sources were inspected.
* **Strong:** All major systems were inspected with only lower-priority exclusions.
* **Partial:** Important systems were inspected, but meaningful runtime, data, lifecycle, or permission areas remain unverified.
* **Limited:** Only a narrow portion of the repository or graph system could be assessed.

Also list:

* Areas inspected
* Areas excluded
* Graph datasets inspected
* Tools and commands used
* Database queries used
* Runtime or external systems unavailable
* Assumptions made
* Whether production graph data was inspected
* Whether lifecycle operations were executed or only statically reviewed
* Whether permission boundaries were tested dynamically

Present the score together with the coverage label.

---

# Historical Comparison

Search for a previous report at:

`docs/audits/knowledge-graph-quality-audit.md`

If a previous audit exists:

* Read its score, category ratings, coverage, measurements, and issue IDs.
* Preserve issue IDs for persistent findings.
* Compare the current and previous scores.
* Report resolved, persistent, regressed, and new issues.
* Confirm resolution using current repository and graph evidence.
* Do not mark an issue resolved merely because a file moved, a symbol was renamed, a query changed, or the finding disappeared from a tool result.
* Confirm that previously invalid graph records were migrated, repaired, removed, or intentionally preserved.
* Distinguish code fixes from graph-data remediation.
* Do not increase the score when code changed but existing graph data remains corrupted.

If no previous report exists, mark this run as the baseline.

---

# Issue Classification

Assign every issue:

## Severity

* **Critical:** Can cause security, privacy, tenant-isolation, destructive data loss, severe graph corruption, production failure, legal risk, or materially incorrect automated decisions.
* **High:** Can break an important workflow, produce substantially incorrect graph reasoning, create widespread stale or duplicated data, or introduce major architectural risk.
* **Medium:** Creates meaningful inconsistency, maintenance risk, retrieval degradation, correction burden, or user confusion.
* **Low:** A valid improvement with limited operational or semantic impact.

## Additional Classification

* **Confidence:** High, Medium, or Low
* **Effort:** Small, Medium, or Large
* **Risk of change:** Low, Medium, High, or Unknown
* **Evidence class:** Confirmed, Probable, or Requires human review
* **Status:** New, Persistent, Regressed, or Previously unresolved

## Issue Type

Use the most specific applicable type:

* ontology ambiguity
* schema mismatch
* invalid node type
* invalid edge type
* missing constraint
* extraction omission
* extraction hallucination
* incorrect node classification
* incorrect relationship
* unsupported relationship
* relationship direction error
* entity duplication
* entity fragmentation
* false entity merge
* alias-resolution failure
* identifier instability
* missing provenance
* broken provenance
* unlabeled derived fact
* confidence-calibration issue
* invalid timestamp
* stale fact
* temporal contradiction
* supersession failure
* update propagation failure
* deletion propagation failure
* re-ingestion duplication
* orphaned node
* dangling edge
* duplicate edge
* partial graph write
* retrieval miss
* invalid traversal
* unsupported multi-hop path
* permission isolation risk
* cross-project data exposure
* missing evaluation
* missing monitoring
* repair-process risk

Estimate a **score impact** for each issue.

Score-impact estimates are prioritization aids, not independent deductions that must sum exactly to the total score.

---

# Required Output

Save the completed report to:

`docs/audits/knowledge-graph-quality-audit.md`

Include:

* Generated timestamp
* Repository name
* Branch name
* Commit or revision hash
* Graph database or storage technology
* Audit scope
* Coverage label
* Tools and commands used
* Database queries used
* Runtime environments inspected
* Whether production graph data was accessed
* Whether write operations were intentionally avoided

The report must use the following structure.

---

# 1. Executive Summary

Place this at the top.

Include:

* Knowledge Graph Quality Score
* Score out of 100
* Grade
* Coverage label
* Previous score
* Score change
* Total issues
* Issues by severity
* Issues by evidence class
* Node count inspected
* Edge count inspected
* Most important finding
* Highest-leverage improvement
* Overall assessment
* Whether the knowledge graph can currently be trusted for production work
* Whether it can be trusted for automated reasoning or agent decisions
* Whether permission isolation was verified
* Whether temporal correctness was verified

Keep this section concise and scannable.

---

# 2. Scorecard

Use this table:

| Category | Weight | Rating 0-5 | Weighted Score | Evidence | Main Gap |
| -------- | -----: | ---------: | -------------: | -------- | -------- |

The weighted scores must total the final score.

After the table, briefly explain each rating and cite the most important evidence.

---

# 3. Graph Quality Metrics

Use this table when the data is available:

| Metric                            | Result | Expected or Threshold | Status | Evidence |
| --------------------------------- | -----: | --------------------: | ------ | -------- |
| Total nodes inspected             |        |                       |        |          |
| Total edges inspected             |        |                       |        |          |
| Nodes missing required properties |        |                       |        |          |
| Edges missing required properties |        |                       |        |          |
| Candidate duplicate nodes         |        |                       |        |          |
| Suspected false merges            |        |                       |        |          |
| Duplicate edges                   |        |                       |        |          |
| Dangling edges                    |        |                       |        |          |
| Orphaned nodes                    |        |                       |        |          |
| Nodes with provenance             |        |                       |        |          |
| Edges with provenance             |        |                       |        |          |
| Invalid timestamps                |        |                       |        |          |
| Stale active facts                |        |                       |        |          |
| Contradictory active facts        |        |                       |        |          |
| Deleted-source facts still active |        |                       |        |          |
| Re-ingestion duplication rate     |        |                       |        |          |
| Permission isolation tests passed |        |                       |        |          |
| Graph evaluation cases passed     |        |                       |        |          |

Add repository-specific metrics when they materially affect quality.

Do not invent thresholds. Use documented requirements, previous baselines, accepted domain rules, or clearly labeled audit recommendations.

---

# 4. Scannable Issue Table

Include every verified issue near the top of the report.

| ID | Issue | Type | Severity | Confidence | Evidence | Effort | Change Risk | Files or Systems | Score Impact | Status |
| -- | ----- | ---- | -------- | ---------- | -------- | ------ | ----------- | ---------------- | -----------: | ------ |

Use sequential IDs:

* `KG-001`
* `KG-002`
* `KG-003`

Preserve existing issue IDs for persistent findings.

Order issues by:

1. Severity
2. Score impact
3. Confidence
4. Change risk
5. Effort

Keep the table concise.

Put full evidence and implementation instructions in the detailed issue sections.

---

# 5. Coverage and System Map

Create a map of what was inspected.

| Area or System | Primary Files or Storage | Evidence Inspected | Status | Coverage | Notes |
| -------------- | ------------------------ | ------------------ | ------ | -------- | ----- |

Include applicable areas such as:

* Source ingestion
* Extraction
* Ontology
* Node schema
* Edge schema
* Entity resolution
* Provenance
* Temporal model
* Graph write paths
* Update and deletion paths
* Merge and supersession paths
* Graph database
* Graph queries
* Graph RAG integration
* Access control
* Administrative correction tools
* Monitoring
* Evaluation datasets
* Tests
* Production data

Use statuses appropriate to the audit:

* Healthy
* Minor issue
* Inconsistent
* High risk
* Missing
* Unverified
* Not applicable

---

# 6. Knowledge Graph Lifecycle Map

Document the complete graph lifecycle.

Use this table:

| Stage                          | Input | Processing | Output | Authoritative Code or Schema | Failure Handling | Observability |
| ------------------------------ | ----- | ---------- | ------ | ---------------------------- | ---------------- | ------------- |
| Source received                |       |            |        |                              |                  |               |
| Source parsed                  |       |            |        |                              |                  |               |
| Entities extracted             |       |            |        |                              |                  |               |
| Relationships extracted        |       |            |        |                              |                  |               |
| Entities resolved              |       |            |        |                              |                  |               |
| Graph records validated        |       |            |        |                              |                  |               |
| Graph write committed          |       |            |        |                              |                  |               |
| Graph retrieved                |       |            |        |                              |                  |               |
| Source updated                 |       |            |        |                              |                  |               |
| Source deleted                 |       |            |        |                              |                  |               |
| Facts merged or superseded     |       |            |        |                              |                  |               |
| Graph repaired or consolidated |       |            |        |                              |                  |               |

Identify all write paths, including background jobs, imports, administrative actions, APIs, tools, migrations, and model-driven writes.

Call out any path that bypasses validation, provenance, permissions, or lifecycle handling.

---

# 7. Ontology and Contract Map

Document the implemented ontology.

Use this table:

| Node or Edge Type | Meaning | Required Properties | Allowed Connections | Cardinality | Provenance Required | Temporal Fields | Authoritative Definition |
| ----------------- | ------- | ------------------- | ------------------- | ----------- | ------------------- | --------------- | ------------------------ |

Also identify:

* Undefined or dynamically generated types
* Duplicate semantic concepts
* Conflicting names
* Deprecated types
* Unused types
* Types present in code but absent from storage
* Types present in storage but absent from code
* Types whose intended meaning requires human clarification

Do not silently normalize or reinterpret ambiguous domain concepts.

---

# 8. Detailed Issues

List every issue sequentially.

Each issue must use this exact structure:

## KG-001: Issue Title

**Type:**
**Severity:**
**Confidence:**
**Evidence class:**
**Effort:**
**Risk of change:**
**Score impact:**
**Status:**

### Problem

Explain the issue and why it matters.

Describe the concrete effect on semantic correctness, security, graph integrity, temporal reasoning, retrieval, maintainability, users, developers, operators, downstream agents, or release safety.

State whether the issue affects existing graph data, future graph writes, or both.

### Current State

Describe the current implementation precisely.

Include:

* Exact file paths
* Exact symbols, routes, schemas, tables, collections, indexes, constraints, jobs, settings, dependencies, queries, or components
* Current graph behavior
* Relevant callers and downstream dependencies
* Representative node, edge, or provenance structures
* Evidence gathered
* Commands, graph queries, searches, or tests performed
* Dynamic, external, generated, database, or framework behavior considered
* Whether production data was inspected
* Why the finding is Confirmed, Probable, or Requires human review
* Which implementation, schema, documentation, or contract appears authoritative and why
* Whether the issue requires code correction, data remediation, or both

### Goal State

Describe the expected state after resolution.

Include:

* What should change
* What should remain unchanged
* The canonical ontology, schema, contract, ownership boundary, or lifecycle behavior
* Required migration or compatibility behavior
* Required remediation for existing graph data
* Required tests
* Required documentation
* Required telemetry or safeguards
* How future developers and agents should understand and use the corrected system
* How the fix avoids false merges, data loss, stale facts, permission leaks, or unsupported relationships

### Prompt to Fix It

Provide a complete, self-contained prompt that can be copied directly into another coding agent.

Use this exact structure inside the prompt:

**Task:**
**Problem:**
**Current state:**
**Goal state:**
**Files to inspect:**
**Schemas, tables, or collections to inspect:**
**Files likely to modify:**
**Graph data likely to remediate:**
**Implementation requirements:**
**Migration or rollout requirements:**
**Constraints:**
**Acceptance criteria:**
**Verification:**

The fix prompt must:

* Include all context required to solve the issue independently
* Name exact files, symbols, schemas, tables, collections, indexes, jobs, and queries
* Describe the desired semantic behavior, not only the desired code edit
* Preserve correct existing behavior
* Include relevant edge cases
* Include code tests and graph-data verification
* Include documentation and telemetry updates when required
* Include a remediation plan for existing graph records when necessary
* Include rollback or recovery requirements for destructive or large migrations
* Preserve provenance and historical information
* Remove obsolete references created by the fix
* Avoid unrelated refactoring
* Require idempotent migrations and repair operations where practical
* Require the fixing agent to stop and report ambiguity before changing an unclear ontology, public contract, permission rule, identity rule, temporal rule, retention policy, or business decision
* Prohibit model-generated timestamps when trusted system timestamps are required
* Prohibit destructive entity merges without evidence, auditability, and rollback behavior
* Require permission filters before graph data reaches a model or downstream agent

### Verification

Explain exactly how to confirm the issue is resolved.

Use repository-specific commands and graph queries when available.

Verification may include:

* Type checking
* Linting
* Unit tests
* Integration tests
* Contract tests
* End-to-end tests
* Builds
* Static analysis
* Schema validation
* Migration testing
* Graph constraint validation
* Duplicate detection queries
* Orphan and dangling-edge queries
* Provenance completeness queries
* Temporal consistency queries
* Re-ingestion tests
* Merge and supersession tests
* Deletion propagation tests
* Permission-isolation tests
* Graph retrieval tests
* Generated artifact comparison
* Search for obsolete references
* Monitoring or telemetry checks
* Manual review for semantic behavior that cannot be automated

Verification must prove the underlying semantic or lifecycle issue is resolved.

Compilation alone is insufficient.

When existing graph data is affected, verification must confirm both:

1. New writes are correct.
2. Existing affected records were safely remediated or intentionally grandfathered with documented reasoning.

---

# 9. Human Decisions and Unverified Risks

Create a separate section for findings that cannot be safely resolved automatically.

For each item, explain:

* What is known
* What remains unknown
* Why repository or graph evidence is insufficient
* Which ontology, identity, temporal, retention, permission, or business decision is required
* The possible consequences of each decision
* The owner or domain specialist needed
* The additional evidence required
* Which files, schemas, migrations, graph records, documentation, and tests should be updated after the decision

Do not provide an automatic destructive or contract-changing fix prompt when the intended behavior cannot be established.

Examples requiring human review may include:

* Whether two domain concepts should be one node type or separate node types
* Whether entities should be global or project-local
* Whether conflicting facts should coexist
* Which source has authority when sources disagree
* Whether historical graph data may be deleted
* Whether a relationship is directional, symmetric, or inferred
* Whether a merge is semantically valid
* Whether derived facts may be used in automated decisions
* Whether certain graph data may cross project or organizational boundaries

---

# 10. Highest-Leverage Fixes

Use this table:

| Priority | Issue ID | Why It Matters | Estimated Score Recovery | Effort | Change Risk |
| -------: | -------- | -------------- | -----------------------: | ------ | ----------- |

Reference existing issue IDs.

Do not create duplicate findings.

Prioritize fixes that:

* Remove root causes
* Prevent further graph corruption
* Protect permission boundaries
* Preserve provenance
* Correct identity resolution
* Repair temporal behavior
* Improve several downstream graph workflows
* Add automated protection against recurrence

Separate immediate containment from long-term correction when necessary.

---

# 11. Existing Data Remediation Plan

When verified issues affect stored graph data, include:

| Issue ID | Affected Records | Detection Query | Remediation Method | Idempotent | Rollback Available | Human Review Required |
| -------- | ---------------: | --------------- | ------------------ | ---------- | ------------------ | --------------------- |

Explain:

* How affected records will be identified
* How false positives will be prevented
* Whether records should be repaired, merged, superseded, invalidated, or deleted
* How provenance and history will be preserved
* How the migration will be tested on a copy or staging dataset
* How the process can be resumed safely
* How the process will report failures
* How post-remediation integrity will be verified

Do not recommend destructive bulk cleanup without a precise detection rule, review path, audit log, and rollback plan.

---

# 12. Prevention Recommendations

Recommend safeguards only when supported by audit evidence.

For each safeguard, include:

* Problem prevented
* Proposed tool, test, policy, metric, constraint, or architectural control
* Where it should run
* Whether it should block merging, deployment, ingestion, graph writes, or releases
* Expected false-positive or maintenance risk
* Owner or responsible area

Consider safeguards such as:

* Schema validators
* Database constraints
* Allowed endpoint-type matrices
* Deterministic canonical identifiers
* Entity-resolution thresholds
* Human review queues
* Provenance requirements
* Trusted timestamp generation
* Re-ingestion idempotency tests
* Graph integrity checks
* Permission-isolation tests
* Temporal contradiction detection
* Duplicate and orphan monitoring
* Graph fixtures
* Golden evaluation datasets
* Migration dry runs
* Repair-job audit logs
* Graph quality dashboards
* Release gates

Prefer automated, repeatable controls over reminders.

---

# 13. Historical Comparison

When a previous report exists, provide:

| Metric                    | Previous | Current | Change |
| ------------------------- | -------: | ------: | -----: |
| Total score               |          |         |        |
| Critical issues           |          |         |        |
| High issues               |          |         |        |
| Medium issues             |          |         |        |
| Low issues                |          |         |        |
| Confirmed findings        |          |         |        |
| Probable findings         |          |         |        |
| Coverage                  |          |         |        |
| Candidate duplicate nodes |          |         |        |
| Dangling edges            |          |         |        |
| Orphaned nodes            |          |         |        |
| Nodes with provenance     |          |         |        |
| Edges with provenance     |          |         |        |
| Stale active facts        |          |         |        |
| Permission tests passed   |          |         |        |

Then list:

* Resolved issues
* Persistent issues
* Regressions
* New issues
* Score changes by category
* Graph-data remediation completed
* Graph-data remediation still pending
* New safeguards added
* Safeguards that failed to prevent regression

When this is the first run, state that it establishes the baseline.

---

# 14. Final Assessment

Conclude with:

* Whether the knowledge graph is dependable
* Whether it can be trusted for production retrieval
* Whether it can be trusted for automated reasoning or agent decisions
* The greatest current risk
* The first issue that should be fixed
* Whether containment is required before continued ingestion
* Whether existing graph data requires remediation
* The expected score after the highest-priority fixes
* The most valuable prevention mechanism
* Any important coverage limitation

Keep the assessment direct and evidence-based.

---

# Audit Behavior Rules

* Do not modify repository files during the audit.
* Do not modify graph data during the audit.
* Do not run destructive migrations, repair operations, merges, deletes, or supersession operations.
* Do not fabricate findings, records, references, commands, query results, metrics, or scores.
* Do not create vague best-practice issues without repository or graph evidence.
* Consolidate symptoms that share the same root cause.
* Prefer fewer high-confidence findings over many speculative findings.
* Use exact file paths, symbols, schemas, node types, edge types, and queries.
* Separate facts, inferences, estimates, and unknowns.
* Do not treat a tool warning as proof without inspecting the code, schema, graph data, and context.
* Do not recommend broad rewrites when a focused correction is sufficient.
* Do not change public contracts, ontology semantics, permissions, identity rules, temporal semantics, retention rules, or business behavior without evidence of the intended state.
* Make every fix prompt independently usable.
* Preserve issue IDs across future audits.
* Use the same scoring rubric every run.
* Keep the report readable by someone who did not perform the audit.
* Treat node existence and node correctness as separate properties.
* Treat edge existence and edge correctness as separate properties.
* Treat provenance presence and provenance correctness as separate properties.
* Treat timestamp presence and timestamp correctness as separate properties.
* Treat duplicate detection and safe entity merging as separate problems.
* Treat source deletion and historical retention as separate policy decisions.
* Do not infer that two nodes are duplicates from names alone.
* Do not infer that a relationship is correct because a path exists.
* Do not infer that a multi-hop answer is supported when only individual edges are supported.
* Do not infer current truth from the most recently ingested record unless source and valid-time semantics support that conclusion.
* Require permission filters to apply before sensitive graph content reaches the model.
* Evaluate whether derived facts are labeled and distinguishable from extracted facts.
* Evaluate abstention behavior when the graph lacks adequate evidence.
* Require system-generated timestamps for processing events.
* Validate model-extracted dates against source evidence and accepted date formats.
* Require merge, supersede, update, and delete operations to preserve an auditable history when the system contract requires temporal reasoning.
* Do not reward future roadmap documentation as implemented functionality.
* Do not increase the score after code-only remediation when affected stored graph data remains unresolved.
* Stop and report ambiguity before recommending destructive graph changes.
