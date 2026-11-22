import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { mapEvent, toEventRow } from '../../src/repositories/event.repository.js';

describe('event compatibility migration', () => {
  it('adds only the confirmed date label and registration notes fields', () => {
    const migration = readFileSync(new URL('../../../supabase/migrations/20261126_events_compatibility.sql', import.meta.url), 'utf8');
    expect(migration).toContain('add column if not exists date_label text');
    expect(migration).toContain('alter column date drop not null');
    expect(migration).toContain("add column if not exists notes text not null default ''");
    expect(migration).not.toMatch(/create table/i);
  });

  it('round-trips the human date label and image while retaining the SQL timestamp mapping', () => {
    const row = toEventRow({ title: 'Courtyard Pop-Up', date: 'Saturday, November 28, 2026 · 11:00 AM - 6:00 PM', image: '/event.webp' });
    expect(row.slug).toBe('courtyard-pop-up');
    expect(row.date_label).toBe('Saturday, November 28, 2026 · 11:00 AM - 6:00 PM');
    expect(row.date).toBe('2026-11-28T05:30:00.000Z');
    expect(row.image_url).toBe('/event.webp');
    expect(mapEvent({ id: 'e1', title: 'Courtyard Pop-Up', date: row.date, date_label: row.date_label, image_url: row.image_url, type: 'POP_UP' })).toMatchObject({ id: 'e1', date: row.date_label, image: '/event.webp' });
  });

  it('preserves a weekday-only event date without fabricating a timestamp', () => {
    const row = toEventRow({ date: 'Saturday, 11:00 AM - 6:00 PM' });
    expect(row.date).toBeNull();
    expect(row.date_label).toBe('Saturday, 11:00 AM - 6:00 PM');
  });
});
