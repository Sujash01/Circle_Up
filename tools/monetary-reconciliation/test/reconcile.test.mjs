import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
  createPurposeToken,
  loadRecords,
  reconcile,
} from '../reconcile.mjs';

const config = {
  entities: {
    products: {
      identifiers: {
        supabase: 'sku',
        legacy: 'sku',
      },
      monetaryFields: {
        price: {
          supabase: 'price',
          legacy: 'price',
        },
      },
    },
  },
};

const run = (supabaseRecords, legacyRecords, cfg = config) =>
  reconcile({
    supabaseRecords: { products: supabaseRecords },
    legacyRecords: { products: legacyRecords },
    config: cfg,
  });

test('equal values are preserved and remain ambiguous absent explicit evidence', () => {
  const report = run(
    [{ sku: 'SYN-1', price: 4000 }],
    [{ sku: 'SYN-1', price: 4000 }],
  );

  assert.equal(report.conversionPerformed, false);
  assert.equal(
    report.classifications.unresolved[0].comparison,
    'EQUAL_RAW_VALUE',
  );
  assert.equal(
    report.classifications.unresolved[0].classification.supabase,
    'AMBIGUOUS',
  );
  assert.equal(
    report.classifications.unresolved[0].values.supabase,
    4000,
  );
});

test('different matching values are reported as conflicting without conversion', () => {
  const report = run(
    [{ sku: 'SYN-1', price: 100 }],
    [{ sku: 'SYN-1', price: 10000 }],
  );

  assert.equal(
    report.classifications.unresolved[0].comparison,
    'DIFFERENT_RAW_VALUE',
  );
  assert.equal(
    report.classifications.unresolved[0].classification.legacy,
    'DUPLICATE_OR_CONFLICTING',
  );
  assert.ok(
    report.findings[0].findings.some(
      (finding) => finding.type === 'CONFLICTING_VALUE',
    ),
  );
});

test('missing records are identified by hashed stable identifiers', () => {
  const report = run(
    [{ sku: 'SYN-1', price: 5 }],
    [],
  );

  assert.ok(
    report.findings[0].findings.some(
      (finding) => finding.type === 'MISSING_IN_LEGACY',
    ),
  );
  assert.equal(
    report.classifications.unresolved[0].comparison,
    'UNMATCHED',
  );
  assert.doesNotMatch(JSON.stringify(report), /SYN-1/);
});

test('missing identifiers in both sources and blank identifiers are unresolved with source row indexes', () => {
  const report = run(
    [
      { price: 1 },
      { sku: null, price: 2 },
      { sku: '   ', price: 3 },
    ],
    [
      { sku: undefined, price: 4 },
      { sku: '', price: 5 },
    ],
  );

  assert.deepEqual(
    report.findings
      .filter((finding) => finding.reason)
      .map(({ source, entity, sourceRowIndex, reason }) => ({
        source,
        entity,
        sourceRowIndex,
        reason,
      })),
    [
      {
        source: 'supabase',
        entity: 'products',
        sourceRowIndex: 1,
        reason: 'MISSING_IDENTIFIER',
      },
      {
        source: 'supabase',
        entity: 'products',
        sourceRowIndex: 2,
        reason: 'NULL_IDENTIFIER',
      },
      {
        source: 'supabase',
        entity: 'products',
        sourceRowIndex: 3,
        reason: 'BLANK_IDENTIFIER',
      },
      {
        source: 'legacy',
        entity: 'products',
        sourceRowIndex: 1,
        reason: 'MISSING_IDENTIFIER',
      },
      {
        source: 'legacy',
        entity: 'products',
        sourceRowIndex: 2,
        reason: 'BLANK_IDENTIFIER',
      },
    ],
  );

  assert.equal(report.classifications.unresolved.length, 5);
});

test('email and phone-like identifiers are rejected regardless of configured field name', () => {
  for (const identifier of [
    'buyer@example.test',
    '+91 98765-43210',
  ]) {
    assert.throws(
      () => run([{ sku: identifier, price: 1 }], []),
      /email or phone-like identifier/,
    );
  }
});

test('matching identifier tokens are consistent within one run and unlinkable across runs', () => {
  const sameRun = run(
    [{ sku: 'SYN-PRIVATE-42', price: 5 }],
    [{ sku: 'SYN-PRIVATE-42', price: 6 }],
  );

  assert.equal(
    sameRun.findings[0].identifierToken,
    sameRun.classifications.unresolved[0].identifierToken,
  );

  assert.doesNotMatch(JSON.stringify(sameRun), /SYN-PRIVATE-42/);

  const firstToken = sameRun.findings[0].identifierToken;

  const secondRun = run(
    [{ sku: 'SYN-PRIVATE-42', price: 5 }],
    [],
  );

  assert.notEqual(
    firstToken,
    secondRun.findings[0].identifierToken,
  );
});

test('duplicate identifiers are reported and never silently matched', () => {
  const report = run(
    [
      { sku: 'SYN-1', price: 5 },
      { sku: 'SYN-1', price: 6 },
    ],
    [{ sku: 'SYN-1', price: 5 }],
  );

  assert.equal(
    report.classifications.unresolved[0].comparison,
    'DUPLICATE_IDENTIFIER',
  );

  assert.ok(
    report.findings[0].findings.some(
      (finding) => finding.type === 'DUPLICATE_IDENTIFIER',
    ),
  );
});

test('null, malformed, negative, fractional and unsafe values are invalid', () => {
  const invalid = [
    null,
    'oops',
    -1,
    1.2,
    Number.MAX_SAFE_INTEGER + 1,
  ];

  for (const value of invalid) {
    const report = run(
      [{ sku: 'SYN-1', price: value }],
      [{ sku: 'SYN-1', price: 1 }],
    );

    assert.equal(
      report.classifications.unresolved[0].classification.supabase,
      'INVALID',
    );
  }
});

test('malformed free-text cells are not copied into the report', () => {
  const report = run(
    [{ sku: 'SYN-1', price: 'person@example.test' }],
    [{ sku: 'SYN-1', price: 1 }],
  );

  const serialized = JSON.stringify(report);

  assert.doesNotMatch(serialized, /person@example\.test/);
  assert.match(serialized, /redactedInvalidValue/);
});

test('malformed monetary fingerprints use per-run keyed HMAC and differ across runs', () => {
  const first = run(
    [{ sku: 'SYN-1', price: 'invalid-private-value' }],
    [{ sku: 'SYN-1', price: 1 }],
  );

  const second = run(
    [{ sku: 'SYN-1', price: 'invalid-private-value' }],
    [{ sku: 'SYN-1', price: 1 }],
  );

  const getFingerprint = (report) =>
    report.classifications.unresolved[0].values.supabase.fingerprint;

  assert.match(getFingerprint(first), /^[a-f0-9]{64}$/);
  assert.notEqual(getFingerprint(first), getFingerprint(second));

  assert.doesNotMatch(
    JSON.stringify(first),
    /invalid-private-value/,
  );

  assert.doesNotMatch(
    JSON.stringify(first),
    /identifierSalt|hmacKey/,
  );
});

test('identifier and invalid-value tokens use distinct HMAC domains and both rotate per run', () => {
  const syntheticSecret = Buffer.from('synthetic-only-test-secret');

  assert.notEqual(
    createPurposeToken(
      syntheticSecret,
      'identifier:',
      'same-input',
    ),
    createPurposeToken(
      syntheticSecret,
      'invalid-value:',
      'same-input',
    ),
  );

  const first = run(
    [{ sku: 'SYN-DOMAIN-1', price: 'malformed' }],
    [{ sku: 'SYN-DOMAIN-1', price: 1 }],
  );

  const second = run(
    [{ sku: 'SYN-DOMAIN-1', price: 'malformed' }],
    [{ sku: 'SYN-DOMAIN-1', price: 1 }],
  );

  const getTokens = (report) => ({
    identifier: report.findings[0].identifierToken,
    invalidValue:
      report.classifications.unresolved[0].values.supabase.fingerprint,
  });

  const firstTokens = getTokens(first);
  const secondTokens = getTokens(second);

  assert.notEqual(firstTokens.identifier, firstTokens.invalidValue);
  assert.notEqual(secondTokens.identifier, secondTokens.invalidValue);
  assert.notEqual(firstTokens.identifier, secondTokens.identifier);
  assert.notEqual(firstTokens.invalidValue, secondTokens.invalidValue);
});

test('explicit classifications are honored but values are never inferred from magnitude', () => {
  const cfg = structuredClone(config);

  cfg.entities.products.monetaryFields.price.classification = {
    supabase: 'CONFIRMED_RUPEES',
    legacy: 'CONFIRMED_PAISE',
  };

  const report = run(
    [{ sku: 'SYN-1', price: 100 }],
    [{ sku: 'SYN-1', price: 100 }],
    cfg,
  );

  assert.equal(
    report.classifications.unresolved[0].classification.supabase,
    'CONFIRMED_RUPEES',
  );

  assert.equal(
    report.classifications.unresolved[0].classification.legacy,
    'CONFIRMED_PAISE',
  );

  assert.equal(
    report.classifications.unresolved[0].ownerDecisionRequired,
    true,
  );
});

test('confirmed equal values are separated from unresolved records and CSV numeric strings compare by value', () => {
  const cfg = structuredClone(config);

  cfg.entities.products.monetaryFields.price.classification = {
    supabase: 'CONFIRMED_PAISE',
    legacy: 'CONFIRMED_PAISE',
  };

  const report = run(
    [{ sku: 'SYN-1', price: 4000 }],
    [{ sku: 'SYN-1', price: '4000' }],
    cfg,
  );

  assert.equal(report.classifications.confirmed.length, 1);
  assert.equal(report.classifications.unresolved.length, 0);

  assert.equal(
    report.classifications.confirmed[0].comparison,
    'EQUAL_RAW_VALUE',
  );

  assert.equal(
    report.classifications.confirmed[0].values.legacy,
    '4000',
  );
});

test('missing fields are reported and source raw values remain unchanged', async () => {
  const originalText = await readFile(
    new URL('../fixtures/supabase-products.json', import.meta.url),
    'utf8',
  );

  const rows = loadRecords(originalText, 'json', 'fixture');
  const before = JSON.stringify(rows);

  const report = run(
    rows,
    [
      { serialNumber: 'SYN-P-001', price: 4000 },
      { serialNumber: 'SYN-P-002', price: 'bad' },
    ],
    {
      entities: {
        products: {
          identifiers: {
            supabase: 'serial_number',
            legacy: 'serialNumber',
          },
          monetaryFields: {
            compareAt: {
              supabase: 'compare_at_price',
              legacy: 'compareAtPrice',
            },
          },
        },
      },
    },
  );

  assert.equal(JSON.stringify(rows), before);
  assert.equal(rows[0].price, 4000);

  assert.ok(
    report.findings.some((record) =>
      record.findings.some(
        (finding) => finding.type === 'MISSING_FIELD',
      ),
    ),
  );
});

test('CSV parser supports quoted commas and preserves CSV raw strings', () => {
  const records = loadRecords(
    'sku,price,note\nSYN-1,100,"coat, vintage"\n',
    'csv',
    'fixture',
  );

  assert.equal(records[0].price, '100');
  assert.equal(records[0].note, 'coat, vintage');
});

test('JSON rejects null, primitive, and array record entries with source/entity/index', () => {
  for (const bad of [
    '[null]',
    '[7]',
    '["text"]',
    '[[1,2]]',
  ]) {
    assert.throws(
      () => loadRecords(bad, 'json', 'Legacy export'),
      /Legacy export entity "records" record 1 must be a plain record object/,
    );
  }

  for (const bad of ['null', '7']) {
    assert.throws(
      () => loadRecords(bad, 'json', 'Legacy export'),
      /Legacy export JSON must be/,
    );
  }

  assert.throws(
    () =>
      loadRecords(
        '{"products":[{} , null]}',
        'json',
        'Supabase export',
      ),
    /Supabase export entity "products" record 2/,
  );

  assert.throws(
    () =>
      loadRecords(
        '{"products":{}}',
        'json',
        'Supabase export',
      ),
    /Supabase export entity "products" must contain an array/,
  );
});

test('CSV rejects quotes inside unquoted fields and characters after a closing quote', () => {
  assert.throws(
    () => loadRecords('sku,price\nSYN"-1,10\n', 'csv', 'fixture'),
    /quote inside an unquoted field/,
  );

  assert.throws(
    () => loadRecords('sku,price\n"SYN-1"x,10\n', 'csv', 'fixture'),
    /unexpected character after a closing quote/,
  );

  assert.throws(
    () => loadRecords('sku,price\n"SYN-1,10\n', 'csv', 'fixture'),
    /unterminated quoted field/,
  );
});

test('CSV supports quoted multiline values and escaped double quotes', () => {
  const records = loadRecords(
    'sku,price,note\nSYN-1,100,"first line\nsecond ""quoted"" line"\n',
    'csv',
    'fixture',
  );

  assert.equal(
    records[0].note,
    'first line\nsecond "quoted" line',
  );
});

test('accepted numeric strings preserve whitespace, plus signs, and decimal notation', () => {
  for (const raw of [' 100 ', '+100', '100.0', '1e2']) {
    const report = run(
      [{ sku: 'SYN-1', price: raw }],
      [{ sku: 'SYN-1', price: 100 }],
    );

    assert.equal(
      report.classifications.unresolved[0].classification.supabase,
      'AMBIGUOUS',
    );

    assert.equal(
      report.classifications.unresolved[0].values.supabase,
      raw,
    );

    assert.equal(
      report.classifications.unresolved[0].comparison,
      'EQUAL_RAW_VALUE',
    );
  }
});

// Regression tests for invalid values requiring owner review.

test('both sources containing null require an owner decision', () => {
  const report = run(
    [{ sku: 'SYN-NULL-1', price: null }],
    [{ sku: 'SYN-NULL-1', price: null }],
  );

  const entry = report.classifications.unresolved[0];

  assert.ok(entry);
  assert.equal(entry.ownerDecisionRequired, true);
  assert.equal(entry.classification.supabase, 'INVALID');
  assert.equal(entry.classification.legacy, 'INVALID');
  assert.equal(report.classifications.confirmed.length, 0);
});

test('both sources containing malformed monetary strings require an owner decision and redact values', () => {
  const report = run(
    [{ sku: 'SYN-BAD-1', price: 'private-malformed-value' }],
    [{ sku: 'SYN-BAD-1', price: 'another-private-value' }],
  );

  const entry = report.classifications.unresolved[0];
  const serialized = JSON.stringify(report);

  assert.ok(entry);
  assert.equal(entry.ownerDecisionRequired, true);
  assert.equal(entry.classification.supabase, 'INVALID');
  assert.equal(entry.classification.legacy, 'INVALID');

  assert.doesNotMatch(serialized, /private-malformed-value/);
  assert.doesNotMatch(serialized, /another-private-value/);
  assert.match(serialized, /redactedInvalidValue/);

  assert.equal(report.classifications.confirmed.length, 0);
});

test('one invalid source and one valid source require an owner decision', () => {
  const report = run(
    [{ sku: 'SYN-ONE-BAD-1', price: 'not-a-number' }],
    [{ sku: 'SYN-ONE-BAD-1', price: 500 }],
  );

  const entry = report.classifications.unresolved[0];
  const serialized = JSON.stringify(report);

  assert.ok(entry);
  assert.equal(entry.ownerDecisionRequired, true);
  assert.equal(entry.classification.supabase, 'INVALID');
  assert.equal(entry.classification.legacy, 'AMBIGUOUS');

  assert.doesNotMatch(serialized, /not-a-number/);
  assert.equal(report.classifications.confirmed.length, 0);
});