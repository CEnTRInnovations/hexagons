# Apiary Output Specification
## CEnTR\*CANON Ingestion Contract — v1.1

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
from,to,weight,polarity
```

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
**Apiary implication:** If Apiary does not collect weight data, omitting the
`weight` column entirely is the preferred export strategy (cleaner than
exporting an all-empty column). `NO WEIGHT` is an acceptable file state.

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
**Apiary implication:** If Apiary does not yet collect polarity data, omitting
the `polarity` column entirely is preferred. `NO POLARITY` is an acceptable
and expected file state for most v1 deployments.

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
{composite_slug}_{YYYY-MM-DD}.csv
```

**Examples:**
```
community-health-perspective_2026-05-15.csv
extension-faculty_2026-05-15.csv
student-advisory-board_2026-05-26.csv
```

Where `composite_slug` corresponds to the contributor group or perspective
name as defined in the CEnTR\*CANON Setup module. The date reflects the
collection date, not the export date, if these differ.

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

---

## 9. Out-of-Scope for Apiary v1

The following are **not** required in the Apiary CSV output for CEnTR\*CANON
v1 compatibility:

| Item | Notes |
|---|---|
| Composite/contributor metadata | Assigned in CEnTR\*CANON Setup; not embedded in the CSV |
| Term definitions or descriptions | Not part of the ingest schema; may be in a companion document |
| Temporal or session identifiers | Conveyed via filename convention or manifest, not CSV columns |
| Multi-sheet or multi-table files | Single flat edge list only; no Excel-style multi-sheet export |
| Ontology references or URIs | Not part of v1 schema |

---

## 10. Version History

| Version | Date | Notes |
|---|---|---|
| 1.0 | 2026-05-26 | Initial specification; aligned to CEnTR\*CANON v1 `mod_gather` |
| 1.1 | 2026-05-26 | Added `polarity` column (-1/0/1, optional, default 1); added `NO POLARITY` validation state; clarified edge list as undirected; updated examples |
