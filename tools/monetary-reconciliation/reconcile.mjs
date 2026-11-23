#!/usr/bin/env node

import { createHmac, randomBytes } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const CLASSIFICATIONS = new Set([
  'CONFIRMED_RUPEES',
  'CONFIRMED_PAISE',
  'AMBIGUOUS',
  'INVALID',
  'DUPLICATE_OR_CONFLICTING',
]);

const PII_FIELD = /name|email|phone|address|customer|personal|contact/i;

export function createPurposeToken(secret, purpose, value) {
  return createHmac('sha256', secret)
    .update(purpose)
    .update(String(value))
    .digest('hex');
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  let afterQuote = false;
  let physicalLine = 1;
  let rowStartLine = 1;

  const endField = () => {
    row.push(field);
    field = '';
    afterQuote = false;
  };

  const endRow = () => {
    endField();

    if (row.some((cell) => cell !== '')) {
      rows.push({ cells: row, line: rowStartLine });
    }

    row = [];
    physicalLine += 1;
    rowStartLine = physicalLine;
  };

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];

    if (quoted) {
      if (char === '"' && text[i + 1] === '"') {
        field += '"';
        i += 1;
      } else if (char === '"') {
        quoted = false;
        afterQuote = true;
      } else {
        field += char;

        if (char === '\n') {
          physicalLine += 1;
        } else if (char === '\r' && text[i + 1] !== '\n') {
          physicalLine += 1;
        }
      }
    } else if (afterQuote) {
      if (char === ',') {
        endField();
      } else if (char === '\n' || char === '\r') {
        if (char === '\r' && text[i + 1] === '\n') {
          i += 1;
        }

        endRow();
      } else {
        throw new Error(
          `CSV has an unexpected character after a closing quote on line ${physicalLine}.`,
        );
      }
    } else if (char === '"') {
      if (field !== '') {
        throw new Error(
          `CSV has a quote inside an unquoted field on line ${physicalLine}.`,
        );
      }

      quoted = true;
    } else if (char === ',') {
      endField();
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[i + 1] === '\n') {
        i += 1;
      }

      endRow();
    } else {
      field += char;
    }
  }

  if (quoted) {
    throw new Error(
      `CSV contains an unterminated quoted field starting on line ${rowStartLine}.`,
    );
  }

  if (afterQuote || field !== '' || row.length) {
    endField();

    if (row.some((cell) => cell !== '')) {
      rows.push({ cells: row, line: rowStartLine });
    }
  }

  if (!rows.length) {
    return [];
  }

  const headers = rows.shift().cells;

  if (
    new Set(headers).size !== headers.length ||
    headers.some((header) => !header)
  ) {
    throw new Error('CSV headers must be non-empty and unique.');
  }

  return rows.map(({ cells, line }, index) => {
    if (cells.length !== headers.length) {
      throw new Error(
        `CSV row ${index + 2} has ${cells.length} columns; expected ${headers.length}.`,
      );
    }

    const record = Object.fromEntries(
      headers.map((header, col) => [header, cells[col]]),
    );

    Object.defineProperty(record, 'sourceRowIndex', {
      value: line,
      enumerable: false,
    });

    return record;
  });
}

function validateRecordArray(records, source, entity) {
  if (!Array.isArray(records)) {
    throw new Error(
      `${source} entity "${entity}" must contain an array of records.`,
    );
  }

  records.forEach((record, index) => {
    if (
      !record ||
      typeof record !== 'object' ||
      Array.isArray(record) ||
      Object.getPrototypeOf(record) !== Object.prototype
    ) {
      throw new Error(
        `${source} entity "${entity}" record ${index + 1} must be a plain record object.`,
      );
    }
  });
}

export function loadRecords(content, format, sourceLabel) {
  if (format === 'csv') {
    return parseCsv(content);
  }

  if (format !== 'json') {
    throw new Error(`${sourceLabel} format must be json or csv.`);
  }

  let parsed;

  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error(`${sourceLabel} is not valid JSON.`);
  }

  const records = Array.isArray(parsed) ? parsed : parsed?.records;

  if (Array.isArray(records)) {
    if (
      parsed &&
      !Array.isArray(parsed) &&
      Object.keys(parsed).some((key) => key !== 'records')
    ) {
      throw new Error(
        `${sourceLabel} JSON records wrapper may contain only the records array.`,
      );
    }

    validateRecordArray(records, sourceLabel, 'records');
    return records;
  }

  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
    const entries = Object.entries(parsed);

    if (entries.length === 0) {
      throw new Error(
        `${sourceLabel} JSON must contain at least one entity array.`,
      );
    }

    for (const [entity, entityRecords] of entries) {
      validateRecordArray(entityRecords, sourceLabel, entity);
    }

    return parsed;
  }

  throw new Error(
    `${sourceLabel} JSON must be an array of records, an object with a records array, or entity arrays.`,
  );
}

function classificationFor(configured, value, present) {
  if (!present || value === null || value === '') {
    return 'INVALID';
  }

  if (integerValue(value) === null) {
    return 'INVALID';
  }

  return configured || 'AMBIGUOUS';
}

function integerValue(value) {
  if (typeof value === 'number') {
    return Number.isSafeInteger(value) && value >= 0 ? value : null;
  }

  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);

    return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
  }

  return null;
}

function reportValue(value, present, identifierSalt) {
  if (!present) {
    return { missing: true };
  }

  if (value === null || typeof value === 'number') {
    return value;
  }

  if (typeof value === 'string' && integerValue(value) !== null) {
    return value;
  }

  // Malformed monetary cells may accidentally contain personal data.
  // Preserve only their type and a keyed fingerprint.
  let serialized;

  try {
    serialized = JSON.stringify(value);
  } catch {
    serialized = String(value);
  }

  const fingerprint = createPurposeToken(
    identifierSalt,
    'invalid-value:',
    serialized ?? '',
  );

  return {
    redactedInvalidValue: true,
    valueType: value === null ? 'null' : typeof value,
    fingerprint,
  };
}

function isPersonalIdentifier(value) {
  const clean = String(value).trim();

  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean)) {
    return true;
  }

  const digits = clean.replace(/\D/g, '');

  return (
    digits.length >= 7 &&
    digits.length <= 15 &&
    /^[+\d().\s-]+$/.test(clean)
  );
}

function indexById(records, idField, source, entity) {
  const index = new Map();
  const duplicates = new Set();
  const missingIdentifiers = [];

  for (const [recordIndex, record] of records.entries()) {
    const id = record[idField];

    if (id === undefined || id === null || String(id).trim() === '') {
      missingIdentifiers.push({
        source,
        entity,
        sourceRowIndex: record.sourceRowIndex ?? recordIndex + 1,
        reason:
          id === undefined
            ? 'MISSING_IDENTIFIER'
            : id === null
              ? 'NULL_IDENTIFIER'
              : 'BLANK_IDENTIFIER',
        record,
      });

      continue;
    }

    if (isPersonalIdentifier(id)) {
      throw new Error(
        `${source} entity "${entity}" record ${record.sourceRowIndex ?? recordIndex + 1} has an email or phone-like identifier; use a non-personal stable identifier.`,
      );
    }

    const key = String(id);

    if (index.has(key)) {
      duplicates.add(key);
      index.get(key).push(record);
    } else {
      index.set(key, [record]);
    }
  }

  return { index, duplicates, missingIdentifiers };
}

export function reconcile({ supabaseRecords, legacyRecords, config }) {
  const identifierSalt = randomBytes(32);

  const token = (id) =>
    createPurposeToken(identifierSalt, 'identifier:', id);

  const report = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    conversionPerformed: false,
    sources: {},
    findings: [],
    classifications: {
      confirmed: [],
      unresolved: [],
    },
  };

  for (const source of ['supabase', 'legacy']) {
    report.sources[source] = {};

    for (const [entityName, entity] of Object.entries(config.entities)) {
      const records =
        source === 'supabase'
          ? supabaseRecords[entityName] || []
          : (legacyRecords)[entityName] || [];

      const idField = entity.identifiers[source];

      if (!idField || PII_FIELD.test(idField)) {
        throw new Error(
          `Unsafe or missing ${source} identifier field for ${entityName}; use a non-personal stable identifier.`,
        );
      }

      validateRecordArray(records, source, entityName);

      const { duplicates, missingIdentifiers } = indexById(
        records,
        idField,
        source,
        entityName,
      );

      report.sources[source][entityName] = {
        recordCount: records.length,
        duplicateIdentifierTokens: [...duplicates].map(token),
      };

      for (const missing of missingIdentifiers) {
        report.findings.push({
          source: missing.source,
          entity: missing.entity,
          sourceRowIndex: missing.sourceRowIndex,
          reason: missing.reason,
        });

        for (const [fieldName, field] of Object.entries(
          entity.monetaryFields,
        )) {
          const row = missing.record;
          const key =
            source === 'supabase' ? field.supabase : (field.legacy);
          const value = row?.[key];

          report.classifications.unresolved.push({
            entity: entityName,
            source,
            sourceRowIndex: missing.sourceRowIndex,
            field: fieldName,
            values: {
              [source]: reportValue(
                value,
                Boolean(row && key in row),
                identifierSalt,
              ),
            },
            comparison: 'UNMATCHED_MISSING_IDENTIFIER',
            classification: {
              [source]: classificationFor(
                field.classification?.[source],
                value,
                Boolean(row && key in row),
              ),
              otherSource: 'AMBIGUOUS',
            },
            ownerDecisionRequired: true,
          });
        }
      }
    }
  }

  for (const [entityName, entity] of Object.entries(config.entities)) {
    const leftRows = supabaseRecords[entityName] || [];
    const rightRows = (legacyRecords)[entityName] || [];

    const left = indexById(
      leftRows,
      entity.identifiers.supabase,
      'supabase',
      entityName,
    );

    const right = indexById(
      rightRows,
      (entity.identifiers.legacy),
      'legacy',
      entityName,
    );

    const allIds = new Set([
      ...left.index.keys(),
      ...right.index.keys(),
      ...left.duplicates,
      ...right.duplicates,
    ]);

    for (const id of allIds) {
      const inLeft = left.index.has(id);
      const inRight = right.index.has(id);
      const duplicated =
        left.duplicates.has(id) || right.duplicates.has(id);

      const recordFindings = [];

      if (duplicated) {
        recordFindings.push({ type: 'DUPLICATE_IDENTIFIER' });
      }

      if (!duplicated && !inLeft) {
        recordFindings.push({ type: 'MISSING_IN_SUPABASE' });
      }

      if (!duplicated && !inRight) {
        recordFindings.push({ type: 'MISSING_IN_LEGACY' });
      }

      const leftGroup = left.index.get(id);
      const rightGroup = right.index.get(id);

      const leftRecord = leftGroup?.[0];
      const rightRecord = rightGroup?.[0];

      for (const [fieldName, field] of Object.entries(
        entity.monetaryFields,
      )) {
        const leftKey = field.supabase;
        const rightKey = (field.legacy);

        for (const [source, row, key] of [
          ['supabase', leftRecord, leftKey],
          ['legacy', rightRecord, rightKey],
        ]) {
          if (row && !(key in row)) {
            recordFindings.push({
              type: 'MISSING_FIELD',
              source,
              field: fieldName,
            });
          }
        }

        const lRaw = leftRecord?.[leftKey];
        const rRaw = rightRecord?.[rightKey];

        const lPresent = Boolean(leftRecord && leftKey in leftRecord);
        const rPresent = Boolean(rightRecord && rightKey in rightRecord);

        const lClass = classificationFor(
          field.classification?.supabase,
          lRaw,
          lPresent,
        );

        const rClass = classificationFor(
          field.classification?.legacy,
          rRaw,
          rPresent,
        );

        if (leftRecord && lClass === 'INVALID') {
          recordFindings.push({
            type: 'INVALID_MONETARY_VALUE',
            source: 'supabase',
            field: fieldName,
          });
        }

        if (rightRecord && rClass === 'INVALID') {
          recordFindings.push({
            type: 'INVALID_MONETARY_VALUE',
            source: 'legacy',
            field: fieldName,
          });
        }

        const comparable =
          leftRecord &&
          rightRecord &&
          lClass !== 'INVALID' &&
          rClass !== 'INVALID';

        const equal =
          comparable && integerValue(lRaw) === integerValue(rRaw);

        if (comparable && !equal) {
          recordFindings.push({
            type: 'CONFLICTING_VALUE',
            field: fieldName,
          });
        }

        const classificationConflict = lClass !== rClass;

        if (classificationConflict && leftRecord && rightRecord) {
          recordFindings.push({
            type: 'CLASSIFICATION_MISMATCH',
            field: fieldName,
          });
        }

        const effectiveLeft = duplicated
          ? 'DUPLICATE_OR_CONFLICTING'
          : comparable && !equal
            ? 'DUPLICATE_OR_CONFLICTING'
            : lClass;

        const effectiveRight = duplicated
          ? 'DUPLICATE_OR_CONFLICTING'
          : comparable && !equal
            ? 'DUPLICATE_OR_CONFLICTING'
            : rClass;

        const entry = {
          entity: entityName,
          identifierToken: token(id),
          field: fieldName,
          values: {
            supabase:
              duplicated && left.duplicates.has(id)
                ? leftGroup.map((row) =>
                    reportValue(
                      row[leftKey],
                      leftKey in row,
                      identifierSalt,
                    ),
                  )
                : reportValue(lRaw, lPresent, identifierSalt),

            legacy:
              duplicated && right.duplicates.has(id)
                ? rightGroup.map((row) =>
                    reportValue(
                      row[rightKey],
                      rightKey in row,
                      identifierSalt,
                    ),
                  )
                : reportValue(rRaw, rPresent, identifierSalt),
          },

          comparison: !leftRecord || !rightRecord
            ? 'UNMATCHED'
            : duplicated
              ? 'DUPLICATE_IDENTIFIER'
              : !lPresent || !rPresent
                ? 'MISSING_FIELD'
                : equal
                  ? 'EQUAL_RAW_VALUE'
                  : 'DIFFERENT_RAW_VALUE',

          classification: {
            supabase: effectiveLeft,
            legacy: effectiveRight,
          },

          // Invalid values always require an owner decision.
          ownerDecisionRequired:
            duplicated ||
            !leftRecord ||
            !rightRecord ||
            !lPresent ||
            !rPresent ||
            lClass === 'INVALID' ||
            rClass === 'INVALID' ||
            lClass === 'AMBIGUOUS' ||
            rClass === 'AMBIGUOUS' ||
            (comparable && !equal) ||
            classificationConflict,
        };

        const target =
          entry.ownerDecisionRequired ||
          effectiveLeft === 'INVALID' ||
          effectiveRight === 'INVALID' ||
          effectiveLeft === 'DUPLICATE_OR_CONFLICTING' ||
          effectiveRight === 'DUPLICATE_OR_CONFLICTING'
            ? report.classifications.unresolved
            : report.classifications.confirmed;

        target.push(entry);
      }

      if (recordFindings.length) {
        report.findings.push({
          entity: entityName,
          identifierToken: token(id),
          findings: recordFindings,
        });
      }
    }
  }

  return report;
}

function parseArgs(args) {
  const result = {};

  for (let i = 0; i < args.length; i += 1) {
    const name = args[i];

    if (
      !['--supabase', '--legacy', '--config', '--output'].includes(name) ||
      !args[i + 1] ||
      args[i + 1].startsWith('--')
    ) {
      throw new Error(`Invalid or incomplete argument: ${name}`);
    }

    const parsedKey = name.slice(2); result[parsedKey] = args[++i]; 
  }

  for (const required of ['supabase', 'legacy', 'config', 'output']) {
    if (!result[required]) {
      throw new Error(`Required argument missing: --${required}`);
    }
  }

  return result;
}

async function readInput(file, label) {
  const extension = path.extname(file).toLowerCase();

  const format =
    extension === '.csv'
      ? 'csv'
      : extension === '.json'
        ? 'json'
        : '';

  return loadRecords(await readFile(file, 'utf8'), format, label);
}

export async function runCli(args) {
  const options = parseArgs(args);
  const outputPath = path.resolve(options.output);

  if (
    [options.supabase, (options.legacy), options.config].some(
      (input) => outputPath === path.resolve(input),
    )
  ) {
    throw new Error(
      'Report output must be a separate path from all inputs and configuration.',
    );
  }

  const [supabaseRecords, legacyRecords, configText] = await Promise.all([
    readInput(options.supabase, 'Supabase export'),
    readInput(options.legacy, 'Legacy export'),
    readFile(options.config, 'utf8'),
  ]);

  let config;

  try {
    config = JSON.parse(configText);
  } catch {
    throw new Error('Classification configuration is not valid JSON.');
  }

  if (
    !config?.entities ||
    typeof config.entities !== 'object' ||
    Array.isArray(config.entities)
  ) {
    throw new Error('Configuration must contain an entities object.');
  }

  for (const [entityName, entity] of Object.entries(config.entities)) {
    if (
      !entity?.identifiers ||
      !entity?.monetaryFields ||
      typeof entity.monetaryFields !== 'object'
    ) {
      throw new Error(`Invalid configuration for entity ${entityName}.`);
    }

    for (const [fieldName, field] of Object.entries(
      entity.monetaryFields,
    )) {
      if (!field?.supabase || !(field.legacy)) {
        throw new Error(
          `Field ${entityName}.${fieldName} requires Supabase and legacy field names.`,
        );
      }

      if (
        PII_FIELD.test(field.supabase) ||
        PII_FIELD.test((field.legacy))
      ) {
        throw new Error(
          `Unsafe personal-data field configured as monetary data: ${entityName}.${fieldName}.`,
        );
      }

      for (const source of ['supabase', 'legacy']) {
        const classification = field.classification?.[source];

        if (classification && !CLASSIFICATIONS.has(classification)) {
          throw new Error(
            `Invalid classification for ${entityName}.${fieldName}.${source}.`,
          );
        }
      }
    }
  }

  // Input shape is an entity-to-record-array object.
  // This tool deliberately imports no app modules.
  const entityNames = Object.keys(config.entities);

  const normalize = (loaded, source) => {
    if (Array.isArray(loaded)) {
      if (entityNames.length === 1) {
        return { [entityNames[0]]: loaded };
      }

      const grouped = Object.fromEntries(
        entityNames.map((name) => [name, []]),
      );

      for (const row of loaded) {
        if (typeof row.entity !== 'string' || !grouped[row.entity]) {
          throw new Error(
            `${source} multi-entity CSV/array rows require a recognized entity column.`,
          );
        }

        grouped[row.entity].push(row);
      }

      return grouped;
    }

    return loaded;
  };

  const report = reconcile({
    supabaseRecords: normalize(supabaseRecords, 'Supabase'),
    legacyRecords: normalize(legacyRecords, 'Legacy export'),
    config,
  });

  await writeFile(
    options.output,
    `${JSON.stringify(report, null, 2)}\n`,
    { flag: 'wx' },
  );

  const counts = Object.fromEntries(
    ['confirmed', 'unresolved'].map((key) => [
      key,
      report.classifications[key].length,
    ]),
  );

  console.log(
    `Monetary reconciliation complete: ${counts.confirmed} confirmed field records, ${counts.unresolved} unresolved field records, ${report.findings.length} record findings.`,
  );

  console.log(
    `Owner decisions required: ${report.classifications.unresolved.length}. Report: ${path.resolve(options.output)}`,
  );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  runCli(process.argv.slice(2)).catch((error) => {
    console.error(`Reconciliation failed: ${error.message}`);
    process.exitCode = 1;
  });
}