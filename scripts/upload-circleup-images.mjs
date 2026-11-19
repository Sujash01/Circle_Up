#!/usr/bin/env node

/**
 * CircleUp – Bulk Product Image Migration (Google Drive to Supabase Storage)
 * 
 * Usage:
 *   Dry run:
 *     node scripts/upload-circleup-images.mjs --dry-run
 * 
 *   Live execution:
 *     node scripts/upload-circleup-images.mjs
 * 
 *   With custom parameters / credentials:
 *     node scripts/upload-circleup-images.mjs --supabase-url=https://xyz.supabase.co --supabase-key=eyJ...
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import heicConvert from 'heic-convert';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

// Attempt to load .env from multiple candidate locations without overwriting existing env
const envPaths = [
  path.join(rootDir, '.env'),
  path.join(rootDir, 'backend', '.env'),
  path.join(rootDir, 'frontend', '.env'),
];

for (const envPath of envPaths) {
  if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath });
  }
}

// ==============================================================================
// 1. CLI Arguments & Configuration
// ==============================================================================

function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    dryRun: false,
    csvPath: path.join(rootDir, 'circleup_final_45_products.csv'),
    reportPath: path.join(__dirname, 'image-migration-report.json'),
    originalsDir: path.join(rootDir, 'uploads', 'originals'),
    convertedDir: path.join(rootDir, 'uploads', 'converted'),
    supabaseUrl:
      process.env.SUPABASE_URL ||
      process.env.NEXT_PUBLIC_SUPABASE_URL ||
      process.env.VITE_SUPABASE_URL ||
      '',
    supabaseKey:
      process.env.SUPABASE_SERVICE_ROLE_KEY ||
      process.env.SUPABASE_SECRET_KEY ||
      process.env.SUPABASE_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
      '',
    bucketName: 'products',
    pathPrefix: '', // e.g. "" produces "3.jpg", or "products/" produces "products/3.jpg"
    concurrency: 3,
    help: false,
  };

  for (const arg of args) {
    if (arg === '--dry-run') {
      options.dryRun = true;
    } else if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else if (arg.startsWith('--csv=')) {
      options.csvPath = path.resolve(process.cwd(), arg.slice('--csv='.length));
    } else if (arg.startsWith('--report=')) {
      options.reportPath = path.resolve(process.cwd(), arg.slice('--report='.length));
    } else if (arg.startsWith('--supabase-url=')) {
      options.supabaseUrl = arg.slice('--supabase-url='.length).trim();
    } else if (arg.startsWith('--supabase-key=')) {
      options.supabaseKey = arg.slice('--supabase-key='.length).trim();
    } else if (arg.startsWith('--bucket=')) {
      options.bucketName = arg.slice('--bucket='.length).trim();
    } else if (arg.startsWith('--path-prefix=')) {
      options.pathPrefix = arg.slice('--path-prefix='.length).trim();
    } else if (arg.startsWith('--concurrency=')) {
      const parsed = parseInt(arg.slice('--concurrency='.length), 10);
      if (!Number.isNaN(parsed) && parsed > 0) options.concurrency = parsed;
    }
  }

  return options;
}

// ==============================================================================
// 2. CSV Parser (RFC 4180 compliant)
// ==============================================================================

function parseCSV(content) {
  const lines = [];
  let currentLine = [];
  let currentField = '';
  let inQuotes = false;

  for (let i = 0; i < content.length; i++) {
    const char = content[i];
    const nextChar = content[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        currentField += '"';
        i++; // skip escaped quote
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      currentLine.push(currentField);
      currentField = '';
    } else if ((char === '\r' || char === '\n') && !inQuotes) {
      if (char === '\r' && nextChar === '\n') {
        i++; // skip CRLF
      }
      currentLine.push(currentField);
      if (currentLine.length > 1 || currentLine[0].trim() !== '') {
        lines.push(currentLine);
      }
      currentLine = [];
      currentField = '';
    } else {
      currentField += char;
    }
  }

  if (currentField.length > 0 || currentLine.length > 0) {
    currentLine.push(currentField);
    if (currentLine.length > 1 || currentLine[0].trim() !== '') {
      lines.push(currentLine);
    }
  }

  if (lines.length === 0) return [];

  const headers = lines[0].map((h) => h.trim().toLowerCase());
  const rows = [];

  for (let r = 1; r < lines.length; r++) {
    const rowObj = {};
    const rowValues = lines[r];
    for (let c = 0; c < headers.length; c++) {
      rowObj[headers[c]] = (rowValues[c] ?? '').trim();
    }
    rows.push(rowObj);
  }

  return rows;
}

// ==============================================================================
// 3. Google Drive ID Extraction & Downloader
// ==============================================================================

function extractDriveFileId(url) {
  if (!url || typeof url !== 'string') return null;

  const matchFileD = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (matchFileD && matchFileD[1]) return matchFileD[1];

  const matchIdParam = url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (matchIdParam && matchIdParam[1]) return matchIdParam[1];

  return null;
}

async function downloadDriveImage(fileId, maxRetries = 3) {
  const directUrl = `https://drive.google.com/uc?export=download&id=${fileId}`;
  const userAgent =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(directUrl, {
        method: 'GET',
        headers: {
          'User-Agent': userAgent,
          Accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
        },
        redirect: 'follow',
      });

      if (!response.ok && response.status !== 302 && response.status !== 303) {
        throw new Error(`HTTP ${response.status} ${response.statusText}`);
      }

      const setCookies = response.headers.get('set-cookie') || '';
      const contentType = response.headers.get('content-type') || '';

      const arrayBuf = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuf);

      // Check if response is HTML (Google Drive warning/interstitial page)
      if (contentType.includes('text/html') || isHtmlBuffer(buffer)) {
        const htmlText = buffer.toString('utf8');

        // Look for confirmation token in download form or URL
        const confirmMatch =
          htmlText.match(/name="confirm"\s+value="([^"]+)"/) ||
          htmlText.match(/confirm=([a-zA-Z0-9_-]+)/) ||
          htmlText.match(/download_warning_[^=]+=([a-zA-Z0-9_-]+)/);

        if (confirmMatch && confirmMatch[1]) {
          const confirmToken = confirmMatch[1];
          const confirmUrl = `https://drive.google.com/uc?export=download&confirm=${confirmToken}&id=${fileId}`;

          const confirmResponse = await fetch(confirmUrl, {
            headers: {
              'User-Agent': userAgent,
              Cookie: setCookies,
            },
            redirect: 'follow',
          });

          if (!confirmResponse.ok) {
            throw new Error(`HTTP ${confirmResponse.status} on confirmation download`);
          }

          const confirmedBuf = Buffer.from(await confirmResponse.arrayBuffer());
          return confirmedBuf;
        }

        const directLinkMatch = htmlText.match(/href="(\/uc\?export=download[^"]+)"/);
        if (directLinkMatch && directLinkMatch[1]) {
          const unescaped = directLinkMatch[1].replace(/&amp;/g, '&');
          const secondResp = await fetch(`https://drive.google.com${unescaped}`, {
            headers: { 'User-Agent': userAgent, Cookie: setCookies },
            redirect: 'follow',
          });
          return Buffer.from(await secondResp.arrayBuffer());
        }

        throw new Error('Google Drive returned an HTML page instead of an image (file may be private or deleted).');
      }

      return buffer;
    } catch (err) {
      if (attempt < maxRetries) {
        const delayMs = attempt * 1500;
        await new Promise((res) => setTimeout(res, delayMs));
      } else {
        throw err;
      }
    }
  }

  throw new Error('Exhausted download retries');
}

// ==============================================================================
// 4. Image Validation & MIME Detection
// ==============================================================================

function isHtmlBuffer(buffer) {
  if (buffer.length < 15) return false;
  const start = buffer.slice(0, 100).toString('utf8').trim().toLowerCase();
  return (
    start.startsWith('<!doctype html') ||
    start.startsWith('<html') ||
    start.startsWith('<?xml') ||
    start.includes('<head')
  );
}

function detectImageFormat(buffer) {
  if (!buffer || buffer.length < 12) {
    return { valid: false, error: 'Buffer too small' };
  }

  // Check JPEG (FF D8 FF)
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { valid: true, extension: 'jpg', mime: 'image/jpeg' };
  }

  // Check PNG (89 50 4E 47 0D 0A 1A 0A)
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return { valid: true, extension: 'png', mime: 'image/png' };
  }

  // Check WEBP (RIFF .... WEBP)
  if (
    buffer.toString('ascii', 0, 4) === 'RIFF' &&
    buffer.toString('ascii', 8, 12) === 'WEBP'
  ) {
    return { valid: true, extension: 'webp', mime: 'image/webp' };
  }

  // Check GIF (GIF87a or GIF89a)
  const gifHeader = buffer.toString('ascii', 0, 6);
  if (gifHeader === 'GIF87a' || gifHeader === 'GIF89a') {
    return { valid: true, extension: 'gif', mime: 'image/gif' };
  }

  // Check HEIC / HEIF (offset 4 has 'ftyp' followed by brand heic, heix, mif1, msf1, etc.)
  if (buffer.length >= 12 && buffer.toString('ascii', 4, 8) === 'ftyp') {
    const brand = buffer.toString('ascii', 8, 12).toLowerCase();
    const compatibleBrands = buffer.toString('ascii', 8, Math.min(buffer.length, 32)).toLowerCase();

    if (
      brand.includes('heic') ||
      brand.includes('heix') ||
      brand.includes('mif1') ||
      brand.includes('msf1') ||
      compatibleBrands.includes('heic') ||
      compatibleBrands.includes('mif1')
    ) {
      return { valid: true, extension: 'heic', mime: 'image/heic' };
    }
  }

  return { valid: false, error: 'Unknown file signature / unsupported format' };
}

// ==============================================================================
// 5. Concurrency Runner
// ==============================================================================

async function runConcurrent(items, limit, workerFn) {
  const results = [];
  let index = 0;

  async function next() {
    while (index < items.length) {
      const i = index++;
      results[i] = await workerFn(items[i], i);
    }
  }

  const workers = Array.from({ length: Math.min(limit, items.length) }, () => next());
  await Promise.all(workers);
  return results;
}

// ==============================================================================
// 6. Main Orchestrator
// ==============================================================================

async function main() {
  const config = parseArgs();

  if (config.help) {
    console.log(`
CircleUp Bulk Product Image Migration Tool
=========================================
Options:
  --dry-run             Run validation without uploading images or updating DB
  --csv=<path>          Path to circleup_final_45_products.csv (default: ./circleup_final_45_products.csv)
  --report=<path>       Path to output JSON report (default: ./scripts/image-migration-report.json)
  --supabase-url=<url>  Supabase Project URL (or env SUPABASE_URL)
  --supabase-key=<key>  Supabase Secret / Service Role Key (or env SUPABASE_SERVICE_ROLE_KEY)
  --bucket=<name>       Storage bucket name (default: products)
  --path-prefix=<pfx>   Storage object prefix (default: "")
  --concurrency=<n>     Download/upload concurrency limit (default: 3)
`);
    process.exit(0);
  }

  console.log('='.repeat(70));
  console.log('🌿 CircleUp – Product Image Migration (Google Drive -> Supabase)');
  console.log('='.repeat(70));
  console.log(`Mode:            ${config.dryRun ? '🔍 DRY RUN (Simulation only)' : '🚀 LIVE EXECUTION'}`);
  console.log(`Source CSV:      ${config.csvPath}`);
  console.log(`Report Output:   ${config.reportPath}`);
  console.log(`Originals Cache: ${config.originalsDir}`);
  console.log(`Bucket:          ${config.bucketName}`);
  console.log(`Concurrency:     ${config.concurrency}`);
  console.log(`Supabase URL:    ${config.supabaseUrl ? config.supabaseUrl : '⚠️ NOT PROVIDED'}`);
  console.log(`Supabase Key:    ${config.supabaseKey ? 'PRESENT (Key provided)' : '⚠️ NOT PROVIDED'}`);
  console.log('-'.repeat(70));

  // Ensure local preservation directories exist
  try {
    fs.mkdirSync(config.originalsDir, { recursive: true });
    fs.mkdirSync(config.convertedDir, { recursive: true });
  } catch {
    // safe ignore if unable to create
  }

  // Step 1: Read and validate CSV
  if (!fs.existsSync(config.csvPath)) {
    console.error(`❌ Source CSV not found at: ${config.csvPath}`);
    process.exit(1);
  }

  const csvRaw = fs.readFileSync(config.csvPath, 'utf8');
  const rows = parseCSV(csvRaw);
  console.log(`📋 Found ${rows.length} product rows in CSV.`);

  if (rows.length === 0) {
    console.error('❌ CSV has no product rows.');
    process.exit(1);
  }

  // Validate all product codes
  const codeSet = new Set();
  const duplicateCodes = [];
  const missingCodes = [];
  const missingDriveUrls = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const code = row.code;
    const url = row.image_drive_url;

    if (!code) {
      missingCodes.push(i + 2);
    } else {
      if (codeSet.has(code)) {
        duplicateCodes.push(code);
      }
      codeSet.add(code);
    }

    if (!url) {
      missingDriveUrls.push(code || `Row ${i + 2}`);
    }
  }

  if (duplicateCodes.length > 0) {
    console.error(`❌ Duplicate product codes found: ${duplicateCodes.join(', ')}`);
    process.exit(1);
  }
  if (missingCodes.length > 0) {
    console.error(`❌ Missing product codes on CSV rows: ${missingCodes.join(', ')}`);
    process.exit(1);
  }
  if (missingDriveUrls.length > 0) {
    console.error(`❌ Missing Google Drive URLs for products: ${missingDriveUrls.join(', ')}`);
    process.exit(1);
  }

  console.log(`✅ All ${rows.length} product codes are unique and valid.`);

  // Step 2: Initialize Supabase Client (if credentials present)
  let supabase = null;
  let supabaseProductsMap = new Map();
  let supabaseError = null;

  if (config.supabaseUrl && config.supabaseKey) {
    try {
      supabase = createClient(config.supabaseUrl, config.supabaseKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      });

      console.log('🔄 Checking Supabase connection and public.products table...');
      const { data: dbProducts, error: dbErr } = await supabase
        .from('products')
        .select('id, serial_number, name, category, product_type, price, images, status');

      if (dbErr) {
        supabaseError = `Failed to query products table: ${dbErr.message}`;
        console.warn(`⚠️ ${supabaseError}`);
      } else if (Array.isArray(dbProducts)) {
        console.log(`✅ Successfully queried public.products (${dbProducts.length} records found).`);
        for (const p of dbProducts) {
          if (p.serial_number) {
            supabaseProductsMap.set(String(p.serial_number).trim(), p);
          }
        }
      }

      console.log(`🔄 Checking Supabase Storage bucket "${config.bucketName}"...`);
      const { data: bucketList, error: bucketErr } = await supabase.storage.getBucket(config.bucketName);
      if (bucketErr) {
        console.warn(`⚠️ Warning checking bucket metadata: ${bucketErr.message}. Attempting list test...`);
        const { error: listErr } = await supabase.storage.from(config.bucketName).list('', { limit: 1 });
        if (listErr) {
          console.warn(`⚠️ Storage bucket access check error: ${listErr.message}`);
        } else {
          console.log(`✅ Supabase Storage bucket "${config.bucketName}" is accessible.`);
        }
      } else {
        console.log(`✅ Supabase Storage bucket "${config.bucketName}" verified (public: ${bucketList.public}).`);
      }
    } catch (e) {
      supabaseError = e.message;
      console.warn(`⚠️ Supabase client initialization error: ${e.message}`);
    }
  } else {
    if (!config.dryRun) {
      console.error(
        '❌ Supabase credentials missing! Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY or pass --supabase-url and --supabase-key.'
      );
      process.exit(1);
    } else {
      console.log(
        'ℹ️ Note: Supabase credentials not provided. Dry-run will validate Drive downloads and image payloads.'
      );
    }
  }

  // Step 3: Process products
  console.log('\n📥 Processing product images from Google Drive...');

  const report = {
    timestamp: new Date().toISOString(),
    isDryRun: config.dryRun,
    totalProductsProcessed: rows.length,
    successfullyDownloadedImages: 0,
    successfullyConvertedHeicImages: 0,
    successfullyUploadedImages: 0,
    successfullyUpdatedDatabaseRecords: 0,
    convertedHeicProductCodes: [],
    missingDriveFiles: [],
    failedUploads: [],
    missingProductRecords: [],
    productCodesRequiringManualAttention: [],
    details: [],
  };

  const processRow = async (row, idx) => {
    const code = String(row.code).trim();
    const driveUrl = row.image_drive_url;
    const name = row.name || 'Untitled';
    const detail = {
      code,
      name,
      driveUrl,
      fileId: null,
      downloadSuccess: false,
      originalFormat: null,
      originalByteLength: 0,
      preservedOriginalPath: null,
      convertedFromHeic: false,
      finalFormat: null,
      finalByteLength: 0,
      storagePath: null,
      publicUrl: null,
      uploadSuccess: false,
      dbMatched: false,
      dbUpdated: false,
      errors: [],
    };

    // 1. Check if product exists in Supabase
    if (supabase) {
      const dbProd = supabaseProductsMap.get(code);
      if (dbProd) {
        detail.dbMatched = true;
        detail.currentDbImages = dbProd.images || [];
      } else {
        detail.dbMatched = false;
        detail.errors.push(`Product code "${code}" not found in Supabase public.products.`);
        report.missingProductRecords.push(code);
      }
    }

    // 2. Extract Drive File ID
    const fileId = extractDriveFileId(driveUrl);
    detail.fileId = fileId;

    if (!fileId) {
      detail.errors.push(`Could not extract Google Drive file ID from URL: ${driveUrl}`);
      report.missingDriveFiles.push(code);
      report.productCodesRequiringManualAttention.push(code);
      report.details.push(detail);
      console.log(`[${idx + 1}/${rows.length}] ❌ [${code}] Invalid Drive URL: ${driveUrl}`);
      return detail;
    }

    // 3. Download image
    let rawBuffer = null;
    try {
      rawBuffer = await downloadDriveImage(fileId);
      detail.originalByteLength = rawBuffer.length;
      detail.downloadSuccess = true;
      report.successfullyDownloadedImages++;
    } catch (err) {
      detail.errors.push(`Drive download failed: ${err.message}`);
      report.missingDriveFiles.push(code);
      report.productCodesRequiringManualAttention.push(code);
      report.details.push(detail);
      console.log(`[${idx + 1}/${rows.length}] ❌ [${code}] Download failed: ${err.message}`);
      return detail;
    }

    // 4. Validate image format
    const formatInfo = detectImageFormat(rawBuffer);
    if (!formatInfo.valid) {
      detail.errors.push(`Invalid image buffer: ${formatInfo.error}`);
      report.productCodesRequiringManualAttention.push(code);
      report.details.push(detail);
      console.log(`[${idx + 1}/${rows.length}] ❌ [${code}] Image validation failed: ${formatInfo.error}`);
      return detail;
    }

    detail.originalFormat = formatInfo.extension;

    // 5. Preserve original downloaded file on disk
    try {
      const originalSavePath = path.join(config.originalsDir, `${code}.${formatInfo.extension}`);
      fs.writeFileSync(originalSavePath, rawBuffer);
      detail.preservedOriginalPath = originalSavePath;
    } catch {
      // safe ignore if file caching encounters permissions
    }

    // 6. HEIC to JPEG conversion (or preserve JPEG/PNG/WebP unchanged)
    let uploadBuffer = rawBuffer;
    let finalExtension = formatInfo.extension;
    let finalMime = formatInfo.mime;

    if (formatInfo.extension === 'heic') {
      try {
        const converted = await heicConvert({
          buffer: rawBuffer,
          format: 'JPEG',
          quality: 0.92,
        });

        uploadBuffer = Buffer.from(converted);
        finalExtension = 'jpg';
        finalMime = 'image/jpeg';
        detail.convertedFromHeic = true;
        detail.finalFormat = 'jpg';
        detail.finalByteLength = uploadBuffer.length;
        report.successfullyConvertedHeicImages++;
        report.convertedHeicProductCodes.push(code);

        // Preserve converted JPEG locally as well
        try {
          fs.writeFileSync(path.join(config.convertedDir, `${code}.jpg`), uploadBuffer);
        } catch {
          // safe ignore
        }
      } catch (convErr) {
        detail.errors.push(`HEIC to JPEG conversion failed: ${convErr.message}`);
        report.productCodesRequiringManualAttention.push(code);
        report.details.push(detail);
        console.log(`[${idx + 1}/${rows.length}] ❌ [${code}] HEIC conversion error: ${convErr.message}`);
        return detail;
      }
    } else {
      detail.convertedFromHeic = false;
      detail.finalFormat = formatInfo.extension;
      detail.finalByteLength = rawBuffer.length;
    }

    const storagePath = `${config.pathPrefix}${code}.${finalExtension}`;
    detail.storagePath = storagePath;

    // 7. Upload to Supabase Storage (Live only)
    if (!config.dryRun && supabase) {
      try {
        const { data: uploadData, error: uploadErr } = await supabase.storage
          .from(config.bucketName)
          .upload(storagePath, uploadBuffer, {
            contentType: finalMime,
            upsert: true,
          });

        if (uploadErr) {
          throw new Error(uploadErr.message);
        }

        const { data: urlData } = supabase.storage
          .from(config.bucketName)
          .getPublicUrl(storagePath);

        const publicUrl = urlData.publicUrl;
        detail.publicUrl = publicUrl;
        detail.uploadSuccess = true;
        report.successfullyUploadedImages++;

        // 8. Update database record
        if (detail.dbMatched) {
          const { error: updateErr } = await supabase
            .from('products')
            .update({
              images: [publicUrl],
              updated_at: new Date().toISOString(),
            })
            .eq('serial_number', code);

          if (updateErr) {
            throw new Error(`DB update error: ${updateErr.message}`);
          }

          detail.dbUpdated = true;
          report.successfullyUpdatedDatabaseRecords++;
          console.log(
            `[${idx + 1}/${rows.length}] ✅ [${code}] Uploaded & Updated DB (${(uploadBuffer.length / 1024).toFixed(1)} KB ${finalExtension.toUpperCase()}${detail.convertedFromHeic ? ' [Converted from HEIC]' : ''})`
          );
        } else {
          detail.errors.push('Skipped DB update because product record was missing in Supabase.');
          report.productCodesRequiringManualAttention.push(code);
          console.log(
            `[${idx + 1}/${rows.length}] ⚠️ [${code}] Uploaded to storage, but product record missing in DB!`
          );
        }
      } catch (err) {
        detail.errors.push(`Upload/DB update failed: ${err.message}`);
        report.failedUploads.push(code);
        report.productCodesRequiringManualAttention.push(code);
        console.log(`[${idx + 1}/${rows.length}] ❌ [${code}] Storage/DB error: ${err.message}`);
      }
    } else {
      // Dry-run simulation
      const simulatedUrl = config.supabaseUrl
        ? `${config.supabaseUrl.replace(/\/+$/, '')}/storage/v1/object/public/${config.bucketName}/${storagePath}`
        : `https://[SUPABASE_PROJECT].supabase.co/storage/v1/object/public/${config.bucketName}/${storagePath}`;

      detail.publicUrl = simulatedUrl;
      detail.uploadSuccess = true;
      detail.dbUpdated = detail.dbMatched;
      const convLabel = detail.convertedFromHeic
        ? ` [HEIC ${(detail.originalByteLength / 1024).toFixed(1)}KB -> JPEG ${(uploadBuffer.length / 1024).toFixed(1)}KB]`
        : ` [${(uploadBuffer.length / 1024).toFixed(1)} KB]`;

      console.log(
        `[${idx + 1}/${rows.length}] 🔍 [${code}] Validated: ${finalExtension.toUpperCase()} -> ${storagePath}${convLabel}`
      );
    }

    report.details.push(detail);
    return detail;
  };

  await runConcurrent(rows, config.concurrency, processRow);

  // Deduplicate attention lists
  report.convertedHeicProductCodes = Array.from(new Set(report.convertedHeicProductCodes));
  report.missingDriveFiles = Array.from(new Set(report.missingDriveFiles));
  report.failedUploads = Array.from(new Set(report.failedUploads));
  report.missingProductRecords = Array.from(new Set(report.missingProductRecords));
  report.productCodesRequiringManualAttention = Array.from(new Set(report.productCodesRequiringManualAttention));

  // Step 4: Write JSON report
  fs.writeFileSync(config.reportPath, JSON.stringify(report, null, 2), 'utf8');

  // Step 5: Summary Output
  console.log('\n' + '='.repeat(70));
  console.log('📊 MIGRATION SUMMARY REPORT');
  console.log('='.repeat(70));
  console.log(`Execution Mode:                        ${config.dryRun ? 'DRY RUN (Simulation)' : 'LIVE EXECUTION'}`);
  console.log(`Total Products in CSV:                 ${report.totalProductsProcessed}`);
  console.log(`Successfully Downloaded Images:        ${report.successfullyDownloadedImages} / ${report.totalProductsProcessed}`);
  console.log(`HEIC Images Converted to JPEG:         ${report.successfullyConvertedHeicImages} (Codes: ${report.convertedHeicProductCodes.join(', ')})`);

  if (!config.dryRun) {
    console.log(`Successfully Uploaded to Storage:      ${report.successfullyUploadedImages} / ${report.totalProductsProcessed}`);
    console.log(`Successfully Updated Database Records: ${report.successfullyUpdatedDatabaseRecords} / ${report.totalProductsProcessed}`);
  }

  console.log(`Missing / Inaccessible Drive Files:    ${report.missingDriveFiles.length}`);
  if (report.missingDriveFiles.length > 0) {
    console.log(`   Codes: ${report.missingDriveFiles.join(', ')}`);
  }

  if (supabase) {
    console.log(`Missing Products in Supabase:          ${report.missingProductRecords.length}`);
    if (report.missingProductRecords.length > 0) {
      console.log(`   Codes: ${report.missingProductRecords.join(', ')}`);
    }
  }

  if (!config.dryRun) {
    console.log(`Failed Storage Uploads:                ${report.failedUploads.length}`);
    if (report.failedUploads.length > 0) {
      console.log(`   Codes: ${report.failedUploads.join(', ')}`);
    }
  }

  console.log(`Codes Requiring Manual Attention:      ${report.productCodesRequiringManualAttention.length}`);
  if (report.productCodesRequiringManualAttention.length > 0) {
    console.log(`   Codes: ${report.productCodesRequiringManualAttention.join(', ')}`);
  }

  console.log(`Originals Cached to:                  ${config.originalsDir}`);
  console.log(`Report saved to:                       ${config.reportPath}`);
  console.log('='.repeat(70));

  if (report.productCodesRequiringManualAttention.length > 0) {
    console.log('⚠️ Process finished with warnings or issues requiring attention.');
    if (!config.dryRun) process.exit(1);
  } else {
    console.log('🎉 All 45 products processed and validated cleanly with zero errors!');
  }
}

main().catch((err) => {
  console.error('Fatal execution error:', err);
  process.exit(1);
});
