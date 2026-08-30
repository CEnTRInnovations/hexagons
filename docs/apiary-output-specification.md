# Apiary Output Specification
## CEnTR\*CANON Ingestion Contract — v1.3

**Applies to:** CEnTR\*CANON v1 (`mod_gather` ingest pipeline)
**Document status:** Draft
**Maintainer:** CEnTRInnovations CAFE Lab

---

## 1. Purpose

This document specifies the CSV output format that Apiary must produce so that
files can be ingested without transformation by CEnTR\*CANON's `mod_gather`
module. It is the authoritative data contract between the two tools.

Apiary term maps represent a single contributor's (or composite perspective's)
relational understanding of community-engaged research vocabulary. Each map is
encoded as an **undirected edge list** in which nodes are term labels and edges
encode meaningful associations between them.

---

## 2. File Format

| Property | Requirement |
|---|---|
| Container format | CSV (comma-separated values) |
| Encoding | UTF-8 (BOM optional; BOM is stripped on ingest) |
| Line endings | LF or CRLF — both accepted |
| Header row | **Required** — first row must contain column names exactly as specified |
| Quoting | RFC 4180 — fields containing commas or double-quotes must be quoted |
| File extension | `.csv` |
| File size | No hard limit; practical ceiling ~50,000 edges per map |

---

## 3. Column Schema

Apiary must produce exactly these columns, in this order. No additional columns
are required, but extra columns are tolerated and silently dropped on ingest.

```
from,to,weight,polarity,direction
```

`weight`, `polarity`, and `direction` are each optional and each gated by an
explicit Apiary parameter (see §3.3–§3.5 and §4). A column is present in the
file if and only if the contributor turned its dimension on in Apiary — so an
all-empty optional column is a valid state meaning "the dimension was offered
but the contributor classified no edges."

### 3.1 `from` — required

| Property | Specification |
|---|---|
| Type | Character string |
| Null/empty | Not permitted — rows with an empty `from` are dropped and flagged |
| Whitespace | Leading/trailing whitespace is normalized on ingest (`str_squish`) |
| Case | Normalized to lowercase on ingest; Apiary may export in any case |
| Max length | No hard limit; labels longer than 200 characters will render truncated in the UI |
| Encoding | Any valid UTF-8; Unicode normalized to NFKC form on ingest |

### 3.2 `to` — required

Same rules as `from`. The `to` field represents the second node in the
undirected association. The pair (`from`, `to`) and (`to`, `from`) are
treated as identical edges.

### 3.3 `weight` — optional

| Property | Specification |
|---|---|
| Type | Numeric (integer or decimal) |
| Null/empty | If the column is absent or a row's value is empty, weight defaults to `1` |
| Range | Must be positive and finite; zero, negative, and `Inf`/`NaN` values are treated as missing and imputed as `1` |
| Precision | Up to 6 decimal places respected; additional precision silently truncated |
| Interpretation | Relative associative strength; used in bundle algorithm structural scoring |
| Timing note | Associative strength may be more meaningful post-consolidation than at mapping time; Apiary omitting weight is a fully acceptable state |

### 3.4 `polarity` — optional

| Property | Specification |
|---|---|
| Type | Integer |
| Permitted values | `-1` (oppositional), `0` (neutral / ambiguous), `1` (supportive) |
| Null/empty | If the column is absent or a row's value is empty, polarity defaults to `1` (supportive) |
| Invalid values | Any value outside `{-1, 0, 1}` is treated as missing and imputed as `1`; flagged in the manifest |
| Interpretation | The character of the association between the two terms as understood by the contributor |
| Default rationale | Most term associations in an Apiary map are constructive co-occurrences; absence of polarity data is not neutrality — it means the contributor did not characterize the valence |
| v2 note | Signed-graph analysis (signed modularity, frustration-based community detection) in `mod_cartography` is planned for v2; the column is defined now to avoid a breaking schema change later |

### 3.5 `direction` — optional

| Property | Specification |
|---|---|
| Type | Presence flag |
| Permitted values | When present, every row's `direction` value is the constant `1`. The column carries no per-row information |
| Null/empty | If the column is absent, the edge list is **undirected** (the default, §6.2) |
| Interpretation | The **presence** of the column declares the edge list directed: `from` is the influencing term, `to` the influenced. Direction is read from row order, not from the column value |
| Bidirectional pairs | A term pair the contributor did not assign a direction to appears as **two rows**, one each way (`A,B` and `B,A`) |
| Consumer note | Build the influence matrix as `M[from][to] += weight`, with `weight` defaulting to `1` when the `weight` column is absent or a cell is empty. This is the MICMAC (influence × dependence) input |
| Default rationale | Absence is not "no direction known" — it means the contributor is treating the map as a plain undirected association graph, the historical default |

---

## 4. Validation States

CEnTR\*CANON's `mod_gather` assigns one of four validation states to each
uploaded file. These states are surfaced in the upload manifest UI and
determine whether the contributor group can proceed through the Survey phase
gate.

### 4.1 `VALID`

All required columns (`from`, `to`) are present and non-empty throughout.
`weight` and `polarity` may or may not be present. The file is fully usable.

**Gate effect:** None — does not block progression.

### 4.2 `NO WEIGHT`

The `weight` column is absent from the file, or is present but all values are
empty. Weight is imputed as `1` for every edge. The condition is logged in the
concordance manifest and surfaced as a non-blocking advisory in the UI.

**Gate effect:** None — does not block progression.
**Apiary implication:** As of Apiary v1.3, weight collection (called *magnitude*
in the Apiary UI) is a per-map togglable parameter, not a permanent capability
gap. When the contributor leaves it off, the `weight` column is omitted and the
file is `NO WEIGHT`. When they turn it on, the column is emitted even if no edge
is classified (all-empty → every weight imputed `1`, same outcome as omission).
Both are acceptable file states.

### 4.3 `SCHEMA MISMATCH`

One or more of the following conditions is true:

- The `from` column is absent or cannot be identified
- The `to` column is absent or cannot be identified
- The file is not parseable as CSV
- The file is empty (zero data rows after header)

**Gate effect:** **Blocks** the Survey phase gate. The contributor group
cannot proceed to Cartography until all uploaded files resolve to `VALID`,
`NO WEIGHT`, or `NO POLARITY`.

---

### 4.4 `NO POLARITY`

The `polarity` column is absent from the file, or is present but all values
are empty. Polarity is imputed as `1` (supportive) for every edge. The
condition is logged in the concordance manifest and surfaced as a
non-blocking advisory in the UI alongside `NO WEIGHT` if both apply.

**Gate effect:** None — does not block progression.
**Apiary implication:** Apiary collects polarity per edge as an *optional*
`+` / `–` classification, gated by a per-map parameter. As of Apiary v1.3,
column presence follows that parameter, not the data: when the contributor
turns polarity on, the `polarity` column is emitted with `1` / `-1` for
classified edges and empty for the rest (empty → imputed `1`, per §3.4) —
**even if zero edges are classified**. When the parameter is off, the column
is omitted entirely and the file is `NO POLARITY`. Both are acceptable states.
(This changed from Apiary's interim polarity build, which only added the
column once at least one edge was classified.)

The same parameter-gated rule applies to `weight` (§4.2) and `direction`
(§3.5): a classified edge whose dimension parameter is **off** exports with
**no column** for that dimension.

---

## 5. Term Normalization (Fingerprinting)

CEnTR\*CANON applies a fingerprinting pipeline to every term label on ingest.
Apiary does **not** need to pre-process labels — normalization happens
automatically and consistently. Understanding the pipeline is useful for
anticipating how terms will appear after ingest.

The fingerprinting steps, in order:

1. **Lowercase** — `stringr::str_to_lower()`
2. **Unicode normalization** — NFKC form via `stringi::stri_trans_nfkc()`
3. **Whitespace normalization** — `stringr::str_squish()` (collapses interior
   whitespace, strips leading/trailing)

**Effect:** `"Community Engagement"`, `" community  engagement "`, and
`"community engagement"` are treated as the same term after fingerprinting.
Apiary label variants that differ only in case or spacing will be merged.

---

## 6. Edge Rules

### 6.1 Self-loops

Edges where `from == to` (after fingerprinting) are **dropped silently** on
ingest. Apiary should avoid exporting self-loops, but they are not a fatal
condition.

### 6.2 Directionality

The edge list is **undirected**. The pair (`from` = A, `to` = B) and
(`from` = B, `to` = A) are treated as the same edge throughout the bundle
algorithm and network analysis. Apiary should not assign semantic meaning to
which term appears in `from` vs. `to`.

**Exception — directed mode (§3.5):** when the `direction` column is present,
`from` = influencer and `to` = influenced, and row order *is* meaningful. This
mode feeds MICMAC structural analysis downstream; the bundle algorithm and
undirected network analysis still collapse the pair as above.

### 6.3 Duplicate edges

If two rows share the same `from`/`to` pair after fingerprinting (including
the reversed pair), their weights are summed and polarity values are averaged
and rounded to the nearest permitted integer (`-1`, `0`, `1`). Apiary may
export duplicates without concern.

### 6.4 Isolated nodes

Nodes that appear only in one column with no corresponding edge partner are
retained in the term list but contribute no structural signal to the bundle
algorithm. Apiary should prefer exporting relational pairs over isolated terms.

---

## 7. File Naming Convention

CEnTR\*CANON does not enforce a file naming schema at ingest — any valid
filename is accepted. However, the following convention is **recommended** to
support audit trails and facilitate manifest readability:

```
{contributor_slug}_{YYYY-MM-DD}.csv
```

**Examples:**
```
community_health_perspective_2026-05-15.csv
extension_faculty_2026-05-15.csv
student_advisory_board_2026-05-26.csv
```

As of Apiary v1.2, `contributor_slug` is generated by Apiary itself from the
**Contributor label** field in the Data panel (`slugify()`: lowercase,
whitespace collapsed to `_`, other unsafe characters stripped) — it no longer
needs to be assigned downstream in a CEnTR\*CANON Setup module. The date
reflects the collection date, not the export date, if these differ.

---

## 8. Minimal Valid File Examples

### 8.1 With weight and polarity

```csv
from,to,weight,polarity
community engagement,trust,3,1
trust,reciprocity,2,1
reciprocity,shared governance,1,1
shared governance,community engagement,2,1
community engagement,institutional oversight,2,-1
co-design,shared governance,1,0
```

### 8.2 With weight only (`NO POLARITY` — acceptable)

```csv
from,to,weight
community engagement,trust,3
trust,reciprocity,2
reciprocity,shared governance,1
shared governance,community engagement,2
community engagement,co-design,1
co-design,shared governance,1
```

### 8.3 Without weight or polarity (`NO WEIGHT` + `NO POLARITY` — acceptable)

```csv
from,to
community engagement,trust
trust,reciprocity
reciprocity,shared governance
shared governance,community engagement
```

### 8.4 Minimal single-edge file (edge case — valid)

```csv
from,to,weight,polarity
community engagement,research,1,1
```

### 8.5 With direction and weight (MICMAC-shaped)

Direction parameter on (`direction` column present, constant `1`, `from` =
influencer), magnitude parameter on (`weight` column). The `care`/`power` pair
had no direction assigned, so it appears as two rows; `trust,care` was directed.

```csv
from,to,weight,direction
care,power,2,1
power,care,2,1
trust,care,3,1
```

---

## 9. Out-of-Scope for Apiary v1

The following are **not** required in the Apiary CSV output for CEnTR\*CANON
v1 compatibility:

| Item | Notes |
|---|---|
| Composite/contributor metadata | Not embedded in the CSV — conveyed via filename convention (§7) only. Apiary's parallel `.bee` output (§10) embeds `contributor.label`/`contributor.id` directly in the file, for Apiary Hive rather than direct CEnTR\*CANON ingestion |
| Term definitions or descriptions | Not part of the ingest schema; may be in a companion document |
| Temporal or session identifiers | Conveyed via filename convention or manifest, not CSV columns |
| Multi-sheet or multi-table files | Single flat edge list only; no Excel-style multi-sheet export |
| Ontology references or URIs | Not part of v1 schema |

---

## 10. Related Format: `.bee` Interchange (Apiary Hive)

Apiary's **Save** action produces a second, complementary output alongside the
CSV documented above: a `.bee` JSON file matching Apiary Hive's ingestion spec
(`bee-file-spec.json` in the `apiary-hive` repository). Where the CSV format
above is the direct, single-contributor CEnTR\*CANON ingestion path, `.bee` is
for **Apiary Hive**, which consolidates multiple contributors' `.bee` files
into one canonical vocabulary before that combined result reaches
CEnTR\*CANON.

```json
{
  "version": "1.0",
  "contributor": { "label": "Group A", "id": "cwdsgcg" },
  "dimensions": { "polarity": false, "magnitude": true, "direction": true },
  "edges": [
    { "from": "care", "to": "power", "weight": 2 },
    { "from": "trust", "to": "care", "weight": 3 }
  ]
}
```

Key differences from the CSV contract:

- `contributor.label` and `contributor.id` are embedded in the file itself —
  the CSV format deliberately leaves contributor metadata out of the file
  (§9). `id` is a short, deterministic hash of the label (Apiary's
  `hashId()`), stable across repeated saves of the same label.
- `dimensions` — a top-level object `{ polarity, magnitude, direction }` of
  booleans, **always written**, recording which per-map dimension parameters
  the contributor had on. On Load, Apiary re-applies these; a `.bee` file
  without a `dimensions` block is read with conservative inference (polarity
  from any `effect` of ±1, magnitude from any `weight` in 1–3, direction only
  if a term pair appears in both orders).
- `weight` is written per edge **only when the magnitude parameter is on and
  that edge has a magnitude** (`1` / `2` / `3`); otherwise omitted (defaults
  to `1` on ingest). `effect` (the `.bee` equivalent of CSV `polarity`) is
  written per edge **only when the polarity parameter is on and the edge is
  classified** `+` / `–` (`1` / `-1`); otherwise omitted (defaults to `1`).
- **direction** is encoded by edge order, not a field: `from` = influencer.
  A pair the contributor gave a direction appears as one edge object; a pair
  with the direction parameter on but no direction set appears as **two edge
  objects**, one each way. With the direction parameter off, edge order is
  arbitrary (sorted).
- Same edge source and edge rules (§6) as the CSV: touching, labeled,
  non-self-loop hex pairs. Isolated hexes are excluded from both formats
  equally.
- Filename: `{contributor_slug}.bee` — no date, since Save is meant as a
  stable working file to resume a session, not a dated point-in-time
  deliverable like the CSV.

This document remains the authoritative contract for the CSV / direct
CEnTR\*CANON ingestion path. `.bee` compatibility is governed by
`bee-file-spec.json` in the `apiary-hive` repository, not by this document.

---

## 11. Version History

| Version | Date | Notes |
|---|---|---|
| 1.0 | 2026-05-26 | Initial specification; aligned to CEnTR\*CANON v1 `mod_gather` |
| 1.1 | 2026-05-26 | Added `polarity` column (-1/0/1, optional, default 1); added `NO POLARITY` validation state; clarified edge list as undirected; updated examples |
| 1.2 | 2026-07-02 | Renamed `composite_slug` → `contributor_slug`, now generated by Apiary's own Contributor label field (§7); noted the `.bee` interchange format as a parallel, non-competing output for Apiary Hive (§10); clarified that Composite/contributor metadata has a home in `.bee` even though it remains out of scope for the CSV (§9) |
| 1.3 | 2026-08-30 | Added optional `direction` column (§3.5): presence declares the edge list directed, `from` = influencer, bidirectional pairs emit two rows — MICMAC input. `weight` / `polarity` / `direction` column presence now tracks explicit Apiary per-map parameters, so an all-empty column is valid (§4); `NO WEIGHT` reframed as togglable (§4.2). `.bee` gains an always-written top-level `dimensions` block; `weight` / `effect` / edge-ordering are parameter-gated (§10) |
