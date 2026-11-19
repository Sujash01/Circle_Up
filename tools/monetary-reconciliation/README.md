# Offline monetary reconciliation

This standalone Node.js utility compares explicitly supplied, sanitized Supabase and MongoDB exports. It has no database or network code and imports no CircleUp application modules. It does not convert, write back, migrate, or delete source values. Razorpay is unrelated and remains disabled.

## Usage

Requires Node.js 20 or later; no additional package install is needed.

```powershell
node tools/monetary-reconciliation/reconcile.mjs `
  --supabase path/to/sanitized-supabase.json `
  --mongodb path/to/sanitized-mongodb.csv `
  --config path/to/classification-config.json `
  --output path/to/new-report.json
```

The output path must be distinct from all inputs/configuration and must not already exist. This prevents accidental overwrite. Inputs can independently be `.json` or `.csv`.

## Accepted input formats

JSON may be an array of record objects, `{ "records": [...] }`, or an object whose keys are configured entity names and whose values are arrays of plain record objects (for example `{ "products": [...], "orders": [...] }`). Null, primitive, array, or malformed rows are rejected with source, entity, and one-based record index. For a single configured entity, a JSON array or CSV can be used directly. For multiple entities in CSV, include an `entity` column containing the configured entity name on every row. CSV uses its first row as unique, non-empty headers; escaped double quotes, quoted commas, and quoted multiline fields are supported. Invalid quoting is rejected. CSV monetary values remain strings in the report. Values accepted as safe non-negative integers compare numerically, while the original representation is preserved.

Example configuration:

```json
{
  "entities": {
    "products": {
      "identifiers": { "supabase": "serial_number", "mongodb": "serialNumber" },
      "monetaryFields": {
        "price": {
          "supabase": "price",
          "mongodb": "price",
          "classification": {
            "supabase": "AMBIGUOUS",
            "mongodb": "AMBIGUOUS"
          }
        }
      }
    }
  }
}
```

Only stable non-personal identifiers may be configured. Identifier field names containing personal-data terms (name, email, phone, address, customer, personal, contact) are rejected. Values that look like email addresses or phone numbers are rejected even if placed in a SKU/serial field. Reports contain per-run keyed HMAC tokens, never raw identifiers; the random salt is not written to the report. Tokens are useful only for matching records within that one report/run and cannot be compared between separate runs. Do not include PII in monetary fields or config. Export only monetary fields and non-personal identifiers needed for matching.

## Classifications and report

Supported explicit field classifications: `CONFIRMED_RUPEES`, `CONFIRMED_PAISE`, `AMBIGUOUS`, `INVALID`, and `DUPLICATE_OR_CONFLICTING`. If no classification is supplied, the classification defaults to `AMBIGUOUS`. The tool never derives a unit from a field name, number magnitude, schema, or matching value. Invalid/missing numeric fields are flagged `INVALID`; duplicates or differing matching values are surfaced as unresolved conflicts. A configured classification is evidence supplied by the report operator, not independently verified by the utility.

The JSON report preserves numeric monetary values and numeric CSV strings as received, includes source record counts, per-field comparison results, classifications, owner-decision flags, and findings for missing/unmatched/duplicate/conflicting/invalid data. Identifier tokens and invalid-value fingerprints use the same per-run secret key with distinct HMAC input prefixes: `identifier:` and `invalid-value:`. The random key is never written to the report, and tokens/fingerprints cannot be compared between separate runs. Non-numeric strings and structured invalid monetary cells are represented by their type and keyed fingerprint rather than copied verbatim, preventing unexpected personal data in a malformed monetary field from entering the report. `conversionPerformed` is always false. No conversion estimate is produced; unit decisions and any future proposal require owner review.

## Safety and limitations

- No MongoDB, Supabase, HTTP, or other external connection is made.
- No `.env` files or secrets are read.
- Source exports are opened read-only; only the new report file is created.
- The report never serializes whole source records and therefore excludes unrelated fields such as customer details. Missing identifiers are reported individually with source, entity, and row index, without inventing a match or including the source record. Numeric monetary values and accepted numeric strings are preserved; malformed free-text values are redacted to type and a fingerprint.
- Use sanitized exports and stable non-personal identifiers. Per-run HMAC tokens do not make unsafe input exports acceptable.
- Matching is exact after converting identifier values to strings. The tool does not infer aliases, reconcile historical schemas, classify units, or decide which database is authoritative.
- The report is an audit artifact, not a migration plan or executable change.

## Synthetic tests

```powershell
node --test tools/monetary-reconciliation/test/*.test.mjs
```

Fixtures in `fixtures/` are synthetic and use `SYN-` identifiers only.
