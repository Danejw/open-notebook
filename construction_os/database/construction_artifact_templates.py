"""Construction lifecycle artifact templates for seeding and UI grouping.

Source of truth: docs/artifacts/lifecycle-by-phase.md
"""

from __future__ import annotations

from typing import Literal

LifecyclePhase = Literal[
    "pursuit_bid",
    "precon",
    "mobilization",
    "construction",
    "closeout",
    "cross_cutting",
]

LIFECYCLE_PHASES: tuple[LifecyclePhase, ...] = (
    "pursuit_bid",
    "precon",
    "mobilization",
    "construction",
    "closeout",
    "cross_cutting",
)


def _artifact(
    name: str,
    title: str,
    description: str,
    prompt: str,
    phase: LifecyclePhase,
) -> dict:
    return {
        "name": name,
        "title": title,
        "description": description,
        "prompt": prompt,
        "apply_default": False,
        "lifecycle_phase": phase,
    }


CONSTRUCTION_ARTIFACT_TEMPLATES: list[dict] = [
    # Phase 1: Pursuit & bidding (10)
    _artifact(
        "Bid Scope Summary",
        "Bid Scope Summary",
        "Summarizes bid scope, trades, and key deliverables from RFP/bid documents",
        "Extract a structured bid scope summary: project type, location, owner/GC, bid date, scope by trade, inclusions/exclusions, and bond/insurance requirements.",
        "pursuit_bid",
    ),
    _artifact(
        "RFQ / RFP Requirements Extract",
        "RFQ / RFP Requirements Extract",
        "Extracts mandatory submission and compliance requirements",
        "List mandatory requirements: forms, certifications, insurance limits, bonding, pre-bid meetings, questions deadline, and disqualification risks.",
        "pursuit_bid",
    ),
    _artifact(
        "Cost & Pricing Risks",
        "Cost & Pricing Risks",
        "Identifies cost, escalation, and pricing risk factors",
        "Identify cost risks: material escalation, labor constraints, long-lead items, allowances, ambiguous specs, and suggested contingency considerations.",
        "pursuit_bid",
    ),
    _artifact(
        "Bid Clarification Log",
        "Bid Clarification Log",
        "Tracks open questions, assumed clarifications, and owner responses needed before bid finalization",
        "List open bid questions with source references, current assumptions, owner/GC responses received, and items still needing clarification before pricing is final.",
        "pursuit_bid",
    ),
    _artifact(
        "Competitor / Market Context Brief",
        "Competitor / Market Context Brief",
        "Summarizes project size, delivery method, known competitors, and labor market context for bid strategy",
        "Extract project size, delivery method, owner history, known competitors or incumbents, labor/material market conditions, and strategic bid positioning notes.",
        "pursuit_bid",
    ),
    _artifact(
        "Allowance & Alternate Matrix",
        "Allowance & Alternate Matrix",
        "Maps base bid vs alternates, allowance buckets, and owner options for proposal structure",
        "Build a matrix of base scope vs alternates and allowances: item description, amount or unit cost, included/excluded trades, and impact on total bid.",
        "pursuit_bid",
    ),
    _artifact(
        "Insurance & Bonding Summary",
        "Insurance & Bonding Summary",
        "Extracts insurance limits, required forms, OCIP/CCIP requirements, and indemnity clauses",
        "Summarize insurance and bonding obligations: coverage limits, required forms, OCIP/CCIP participation, indemnity clauses, and items needing legal or finance review.",
        "pursuit_bid",
    ),
    _artifact(
        "Drawing Set Index",
        "Drawing Set Index",
        "Indexes sheets by discipline with revision dates and flags missing or referenced-but-absent sheets",
        "Produce a sheet index by discipline (A/S/M/E/P/C): sheet number, title, revision date, and notes. Flag missing sheets and key details sheets worth estimator review.",
        "pursuit_bid",
    ),
    _artifact(
        "Scope by Drawing Package",
        "Scope by Drawing Package",
        "Maps which trades own which sheets and areas to support subcontractor outreach at bid stage",
        "Assign scope by trade to drawing packages and areas: trade, sheet numbers, locations, and key scope elements shown. Note gaps needing subcontractor quotes.",
        "pursuit_bid",
    ),
    _artifact(
        "Design Intent Summary",
        "Design Intent Summary",
        "Narrative summary of building systems and design intent for executive proposal summaries",
        "Write a plain-language design intent summary: building type, major systems, occupancy, structural approach, MEP strategy, and notable design features for proposal use.",
        "pursuit_bid",
    ),
    # Phase 2: Pre-construction & design coordination (16)
    _artifact(
        "Quantity Takeoff Extract",
        "Quantity Takeoff Extract",
        "Extracts measurable quantities and units for estimation",
        "List quantifiable items with units (LF, SF, CY, EA, etc.), locations/areas, and source references. Note items needing field verification.",
        "precon",
    ),
    _artifact(
        "Schedule & Milestones",
        "Schedule & Milestones",
        "Extracts schedule dates, milestones, and critical path items",
        "Extract key dates, milestones, phased work, weather windows, owner milestones, and schedule risks or float concerns.",
        "precon",
    ),
    _artifact(
        "Submittal / Spec Compliance",
        "Submittal / Spec Compliance",
        "Maps submittal and specification compliance obligations",
        "Extract submittal requirements, approved equals, testing, warranties, mock-ups, and spec sections referenced.",
        "precon",
    ),
    _artifact(
        "Spec Section Digest",
        "Spec Section Digest",
        "Summarizes scope, products, execution, and QA requirements per CSI division",
        "Digest each relevant spec section: division, scope summary, key products, execution requirements, QA/testing, and submittal obligations. Cite section numbers.",
        "precon",
    ),
    _artifact(
        "Drawing–Spec Crosswalk",
        "Drawing–Spec Crosswalk",
        "Cross-references drawing callouts to spec sections and flags conflicts or gaps",
        "Map drawing references to spec sections: sheet/detail, spec section cited, scope described, and any conflicts or missing cross-references between drawings and specs.",
        "precon",
    ),
    _artifact(
        "Coordination Conflict Scan",
        "Coordination Conflict Scan",
        "Identifies clashes and ambiguities between disciplines such as ceiling height vs duct routing",
        "Scan for coordination conflicts between disciplines: location, systems involved, conflict description, affected sheets, and recommended resolution or RFI topic.",
        "precon",
    ),
    _artifact(
        "Long-Lead Item Register",
        "Long-Lead Item Register",
        "Lists equipment and materials with lead times, approved manufacturers, and early buy needs",
        "List long-lead items: description, spec section, approved manufacturers, estimated lead time, required-by date, and submittal or procurement dependencies.",
        "precon",
    ),
    _artifact(
        "Permit & Inspection Roadmap",
        "Permit & Inspection Roadmap",
        "Maps required permits, AHJ requirements, special inspections, and sign-off sequence",
        "Outline permits and inspections: permit type, authority having jurisdiction, triggering milestone, special inspections required, and sign-off sequence before occupancy.",
        "precon",
    ),
    _artifact(
        "Value Engineering Opportunities",
        "Value Engineering Opportunities",
        "Identifies over-specs, duplicate systems, and constructability issues for cost savings",
        "Identify value engineering opportunities: current spec or design approach, suggested alternative, estimated savings or schedule benefit, and trade or design impacts.",
        "precon",
    ),
    _artifact(
        "Room / Area Program",
        "Room / Area Program",
        "Extracts room name, number, area, finish level, and occupancy from architectural drawings",
        "Build a room/area program table: room number, name, area, finish level, occupancy type, and sheet reference. Flag rooms with incomplete program data.",
        "precon",
    ),
    _artifact(
        "Door & Window Schedule Extract",
        "Door & Window Schedule Extract",
        "Extracts mark, size, type, hardware group, and fire rating from door and window schedules",
        "Extract door and window schedule data: mark, size, type, material, hardware group, fire rating, and location. Note schedule items missing from plans.",
        "precon",
    ),
    _artifact(
        "Finish Schedule Extract",
        "Finish Schedule Extract",
        "Extracts floor, wall, ceiling, and base finishes by room from architectural schedules",
        "Extract finish schedule by room: floor, wall, ceiling, base, and special finishes with product references. Cite schedule and room numbers.",
        "precon",
    ),
    _artifact(
        "Accessibility (ADA) Checklist",
        "Accessibility (ADA) Checklist",
        "Checks clearances, ramp slopes, grab bars, signage, and other accessibility obligations",
        "List accessibility requirements and observed conditions: element, required standard, location, compliance status, and corrective action if non-compliant.",
        "precon",
    ),
    _artifact(
        "Life Safety / Egress Summary",
        "Life Safety / Egress Summary",
        "Summarizes occupant load, exit paths, fire ratings, and smoke compartment requirements",
        "Summarize life safety and egress: occupant loads, exit paths, fire-rated assemblies, smoke compartments, and code references from drawings and specs.",
        "precon",
    ),
    _artifact(
        "Structural Notes Digest",
        "Structural Notes Digest",
        "Digests design loads, special inspections, embed requirements, and structural notes",
        "Digest structural general notes: design loads, special inspections, embed and anchorage requirements, sequencing constraints, and items needing structural RFI.",
        "precon",
    ),
    _artifact(
        "Site & Civil Summary",
        "Site & Civil Summary",
        "Summarizes grading, utilities, stormwater, easements, and temporary facilities from civil drawings",
        "Summarize site and civil scope: grading, utilities, stormwater, easements, temp facilities, and earthwork quantities. Flag conflicts with architectural or MEP site work.",
        "precon",
    ),
    # Phase 3: Mobilization & procurement (5)
    _artifact(
        "Subcontractor Scope Letter Draft",
        "Subcontractor Scope Letter Draft",
        "Drafts trade-specific scope letters with exclusions, allowances, and drawing references for buyout",
        "Draft a subcontractor scope letter for the trade shown: inclusions, exclusions, allowances, drawing/spec references, schedule constraints, and buyout clarifications needed.",
        "mobilization",
    ),
    _artifact(
        "Site Logistics Plan Brief",
        "Site Logistics Plan Brief",
        "Summarizes crane zones, staging, access, laydown areas, and traffic control for field readiness",
        "Summarize site logistics: crane zones, staging and laydown, access routes, traffic control, material delivery windows, and constraints from drawings or site plans.",
        "mobilization",
    ),
    _artifact(
        "Procurement Tracker Seed",
        "Procurement Tracker Seed",
        "Seeds procurement tracking with item, spec section, required-by date, and submittal dependencies",
        "List procurement items to track: description, spec section, required-by date, submittal status dependency, responsible party, and early-buy flag.",
        "mobilization",
    ),
    _artifact(
        "Preconstruction Meeting Brief",
        "Preconstruction Meeting Brief",
        "Prepares kickoff brief with attendees, decisions needed, open RFIs, and baseline schedule context",
        "Prepare a preconstruction meeting brief: attendees, agenda, decisions required, open RFIs/submittals, baseline schedule highlights, and action items with owners.",
        "mobilization",
    ),
    _artifact(
        "Baseline Schedule Narrative",
        "Baseline Schedule Narrative",
        "Explains the critical path and major phases in plain language for owner and GC communication",
        "Write a baseline schedule narrative: major phases, critical path story, key milestones, constraints, and float risks in plain language for stakeholder communication.",
        "mobilization",
    ),
    # Phase 4: Construction execution (13)
    _artifact(
        "Change-Order Impact",
        "Change-Order Impact",
        "Analyzes scope changes for cost, schedule, and contract impact",
        "Summarize the change: scope delta, affected trades, cost drivers, schedule impact, and recommended pricing/negotiation notes.",
        "construction",
    ),
    _artifact(
        "Safety & Code Checklist",
        "Safety & Code Checklist",
        "Extracts safety, OSHA, and code compliance obligations",
        "List safety/code obligations: PPE, permits, inspections, hazardous work, environmental controls, and site-specific safety requirements.",
        "construction",
    ),
    _artifact(
        "RFI Draft / Register Entry",
        "RFI Draft / Register Entry",
        "Drafts RFI questions with affected sheets/specs and proposed resolution for the register",
        "Draft an RFI entry: question, affected sheets and spec sections, proposed resolution, cost/schedule impact if known, and priority. Cite source references.",
        "construction",
    ),
    _artifact(
        "Submittal Review Summary",
        "Submittal Review Summary",
        "Summarizes product compliance vs spec, deviations, and required reviewer actions",
        "Summarize submittal review: product submitted, spec compliance status, deviations noted, action required (approve/revise/resubmit), and follow-up items.",
        "construction",
    ),
    _artifact(
        "Daily Report Digest",
        "Daily Report Digest",
        "Digests weather, crew counts, work completed, delays, and visitors from field notes",
        "Digest the daily report: date, weather, crew by trade, work completed, delays or constraints, visitors, and safety incidents or near misses.",
        "construction",
    ),
    _artifact(
        "Punch List Item Extract",
        "Punch List Item Extract",
        "Extracts punch items with location, trade, deficiency description, and priority",
        "Extract punch list items: location, trade, deficiency description, priority, photo or note reference, and suggested responsible party.",
        "construction",
    ),
    _artifact(
        "Progress vs Schedule Snapshot",
        "Progress vs Schedule Snapshot",
        "Compares planned vs observed progress for the reporting period",
        "Compare planned vs actual progress: activity, planned dates, observed status, percent complete, variance explanation, and recovery actions if behind.",
        "construction",
    ),
    _artifact(
        "Meeting Minutes (Construction)",
        "Meeting Minutes (Construction)",
        "Extracts decisions, action items, responsible parties, and due dates from OAC or weekly meetings",
        "Produce construction meeting minutes: attendees, decisions made, action items with owner and due date, open issues, and items held for next meeting.",
        "construction",
    ),
    _artifact(
        "Delay & Claim Evidence Pack",
        "Delay & Claim Evidence Pack",
        "Documents delay events, causes, notice requirements, and supporting evidence for claims",
        "Document delay or claim evidence: event date, cause, contract notice requirements, supporting logs or correspondence, and recommended next steps.",
        "construction",
    ),
    _artifact(
        "Quality Control Checklist",
        "Quality Control Checklist",
        "Extracts hold points, testing frequency, and responsible inspector from spec QA sections",
        "List QC requirements: hold point, test or inspection type, frequency, responsible inspector, acceptance criteria, and spec section reference.",
        "construction",
    ),
    _artifact(
        "Revision Delta Summary",
        "Revision Delta Summary",
        "Summarizes what changed between drawing revisions and impact by trade",
        "Summarize drawing revision changes: sheet, prior vs current revision, change description, affected trades, and cost/schedule impact if identifiable.",
        "construction",
    ),
    _artifact(
        "As-Built Markup Guide",
        "As-Built Markup Guide",
        "Identifies sheets requiring field redlines and systems to capture during construction",
        "List as-built markup requirements: sheet number, systems to capture, redline conventions, responsible trade, and deadline aligned with closeout submittals.",
        "construction",
    ),
    _artifact(
        "Installation Sequence by Area",
        "Installation Sequence by Area",
        "Defines rough-in through close-in sequence for a zone or floor",
        "Define installation sequence for the area shown: zone/floor, trade order from rough-in to close-in, prerequisites, inspection hold points, and coordination notes.",
        "construction",
    ),
    # Phase 5: Closeout & handoff (7)
    _artifact(
        "Closeout Document Checklist",
        "Closeout Document Checklist",
        "Tracks O&M manuals, warranties, training, spare parts, and as-builts required for closeout",
        "Build a closeout checklist: document type, spec or contract reference, status, responsible party, due date, and missing items blocking substantial completion.",
        "closeout",
    ),
    _artifact(
        "O&M Manual Index",
        "O&M Manual Index",
        "Indexes equipment with manual status and flags missing operation and maintenance documents",
        "Index O&M manuals: equipment or system, location, manual status (received/missing/in review), spec section, and action needed for turnover.",
        "closeout",
    ),
    _artifact(
        "Warranty Register",
        "Warranty Register",
        "Registers systems with warranty duration, start trigger, and contact information",
        "Register warranties: system or product, duration, start trigger (substantial completion/date of use), warranty contact, and documentation on file.",
        "closeout",
    ),
    _artifact(
        "Training & Turnover Brief",
        "Training & Turnover Brief",
        "Summarizes owner training requirements and who delivers each session",
        "Summarize training and turnover: system, training requirement, provider (GC/sub/manufacturer), scheduled date, attendees, and completion status.",
        "closeout",
    ),
    _artifact(
        "Final Punch by Trade",
        "Final Punch by Trade",
        "Groups remaining punch items by trade for subcontractor closeout",
        "Group open punch items by trade: trade name, item count, locations, priority items, and closeout deadline. Flag trades blocking final acceptance.",
        "closeout",
    ),
    _artifact(
        "Lessons Learned Report",
        "Lessons Learned Report",
        "Captures what went well, overruns, repeated RFIs, and drawing gaps for future projects",
        "Capture lessons learned: category (cost/schedule/quality/safety/design), observation, root cause, recommendation, and applicability to future bids or projects.",
        "closeout",
    ),
    _artifact(
        "Project Executive Summary",
        "Project Executive Summary",
        "One-page handoff summary for leadership and future bid reference",
        "Write a one-page executive summary: project overview, contract value, schedule outcome, major changes, key risks encountered, and takeaways for future work.",
        "closeout",
    ),
    # Phase 6: Cross-cutting super artifacts (6)
    _artifact(
        "Project Risk Register",
        "Project Risk Register",
        "Consolidates cost, schedule, safety, design, and contractual risks with severity",
        "Build a risk register entry or update: risk description, category, likelihood, impact, mitigation, owner, and status. Cite supporting documents.",
        "cross_cutting",
    ),
    _artifact(
        "Open Items Dashboard",
        "Open Items Dashboard",
        "Consolidates unresolved RFIs, submittals, change orders, punch, and permits in one view",
        "List open project items: type (RFI/submittal/CO/punch/permit), description, age, owner, due date, and blocker status. Prioritize items affecting critical path.",
        "cross_cutting",
    ),
    _artifact(
        "Trade Responsibility Matrix",
        "Trade Responsibility Matrix",
        "Maps who owns scope across drawings, specs, and contract documents",
        "Map trade responsibilities: trade, scope element, drawing reference, spec section, contract reference, and gaps where ownership is unclear.",
        "cross_cutting",
    ),
    _artifact(
        "Document Conflict Report",
        "Document Conflict Report",
        "Flags instances where drawings and specs disagree, with citations",
        "Report document conflicts: topic, drawing says, spec says, location references, recommended resolution, and RFI or change order needed.",
        "cross_cutting",
    ),
    _artifact(
        "Owner / GC Communication Log",
        "Owner / GC Communication Log",
        "Extracts decisions and commitments from owner and GC correspondence",
        "Log owner/GC communications: date, parties, topic, decision or commitment made, follow-up required, and contract or schedule implications.",
        "cross_cutting",
    ),
    _artifact(
        "Constructability Review",
        "Constructability Review",
        "Identifies sequencing, access, crane, temp power, and phasing issues before mobilization",
        "Identify constructability issues: location/system, issue description, phase affected, suggested mitigation, and impact on cost or schedule if unaddressed.",
        "cross_cutting",
    ),
]

CONSTRUCTION_ARTIFACT_NAMES: tuple[str, ...] = tuple(
    template["name"] for template in CONSTRUCTION_ARTIFACT_TEMPLATES
)
