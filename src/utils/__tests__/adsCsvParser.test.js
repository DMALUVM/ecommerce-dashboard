import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  toNum,
  parseAdsCsv,
  detectPlatform,
  parseGoogleCampaignCsv,
  parseMetaAdsCsv,
  aggregateRowsByDay,
  checkReconciliation,
  deriveMetaCampaign,
  sanitizeDayAdsMetrics,
  DeprecatedAdsCsvFormat,
  UnknownAdsCsvFormat,
  parseGoogleRows,
} from '../adsCsvParser';

const fixturesDir = join(__dirname, 'fixtures');
const readFixture = (name) => readFileSync(join(fixturesDir, name), 'utf-8');

// ─── toNum() ────────────────────────────────────────────────────────────────

describe('toNum', () => {
  it('coerces Meta "null" string to 0 (default fallback)', () => {
    expect(toNum('null')).toBe(0);
  });

  it('is case-insensitive for null variants', () => {
    expect(toNum('NULL')).toBe(0);
    expect(toNum('Null')).toBe(0);
    expect(toNum('nUlL')).toBe(0);
  });

  it('returns custom fallback for null/empty when specified', () => {
    expect(toNum('null', null)).toBeNull();
    expect(toNum('', null)).toBeNull();
    expect(toNum(undefined, null)).toBeNull();
  });

  it('handles JS null/undefined/empty', () => {
    expect(toNum(null)).toBe(0);
    expect(toNum(undefined)).toBe(0);
    expect(toNum('')).toBe(0);
  });

  it('handles dash placeholders', () => {
    expect(toNum('-')).toBe(0);
    expect(toNum('--')).toBe(0);
    expect(toNum('—')).toBe(0);
    expect(toNum(' --')).toBe(0);
  });

  it('parses normal numbers', () => {
    expect(toNum('42')).toBe(42);
    expect(toNum('3.14')).toBe(3.14);
    expect(toNum(100)).toBe(100);
  });

  it('strips dollar signs, commas, and whitespace', () => {
    expect(toNum('$1,234.56')).toBe(1234.56);
    expect(toNum('$0.13')).toBe(0.13);
  });

  it('strips percent signs', () => {
    expect(toNum('24%')).toBe(24);
    expect(toNum('2.67%')).toBe(2.67);
  });

  it('handles comma-thousands in impressions (Google "1,359")', () => {
    expect(toNum('1,359')).toBe(1359);
    expect(toNum('996')).toBe(996);
  });

  it('returns 0 for NaN / Infinity', () => {
    expect(toNum(NaN)).toBe(0);
    expect(toNum(Infinity)).toBe(0);
    expect(toNum(-Infinity)).toBe(0);
  });

  it('returns 0 for garbage strings', () => {
    expect(toNum('abc')).toBe(0);
    expect(toNum('N/A')).toBe(0);
  });

  it('never returns NaN', () => {
    const edgeCases = [null, undefined, '', 'null', 'NULL', 'Null', '-', '—',
      NaN, Infinity, 'abc', '  ', '\t', 'null ', ' null', '--', ' --'];
    for (const v of edgeCases) {
      const result = toNum(v);
      expect(Number.isFinite(result)).toBe(true);
    }
  });
});

// ─── detectPlatform() — 3-way detection ────────────────────────────────────

describe('detectPlatform', () => {
  it('detects Google campaign-grain CSV (2-line preamble)', () => {
    const csv = readFixture('google_sample.csv');
    expect(detectPlatform(csv)).toBe('google');
  });

  it('detects Meta CSV', () => {
    const csv = readFixture('meta_sample.csv');
    expect(detectPlatform(csv)).toBe('meta');
  });

  it('rejects deprecated Ad-grain Google CSV with DeprecatedAdsCsvFormat', () => {
    const csv = readFixture('google_ad_grain_deprecated.csv');
    expect(() => detectPlatform(csv)).toThrow(DeprecatedAdsCsvFormat);
  });

  it('throws UnknownAdsCsvFormat for unrecognized input', () => {
    expect(() => detectPlatform('Name,Age,City\nAlice,30,NYC')).toThrow(UnknownAdsCsvFormat);
  });

  it('throws UnknownAdsCsvFormat for Google preamble missing Campaign type', () => {
    const csv = 'Google report\nJan 1 - Jan 10\nDay,Campaign,Cost\n2026-01-01,Test,10';
    expect(() => detectPlatform(csv)).toThrow(UnknownAdsCsvFormat);
  });
});

// ─── Google Campaign-grain parsing ─────────────────────────────────────────

describe('parseGoogleCampaignCsv', () => {
  const csv = readFixture('google_sample.csv');

  it('skips the 2-line preamble and parses all data rows', () => {
    const rows = parseGoogleCampaignCsv(csv);
    expect(rows.length).toBe(30);
  });

  it('each row has the NormalizedAdRow shape', () => {
    const rows = parseGoogleCampaignCsv(csv);
    const r = rows[0];
    expect(r).toHaveProperty('date');
    expect(r).toHaveProperty('platform', 'google');
    expect(r).toHaveProperty('campaign');
    expect(r).toHaveProperty('campaign_type');
    expect(r).toHaveProperty('ad_identifier');
    expect(r).toHaveProperty('spend');
    expect(r).toHaveProperty('revenue');
    expect(r).toHaveProperty('conversions');
    expect(r).toHaveProperty('impressions');
    expect(r).toHaveProperty('clicks');
    expect(r).toHaveProperty('currency');
  });

  it('parses comma-thousands in Impr. column', () => {
    const rows = parseGoogleCampaignCsv(csv);
    const pmaxRow = rows.find(r => r.campaign.includes('PMAX') && r.date === '2026-01-01');
    expect(pmaxRow.impressions).toBe(996);
    const shoppingRow = rows.find(r => r.campaign.includes('Shopping') && r.date === '2026-01-01');
    expect(shoppingRow.impressions).toBe(1200);
  });

  it('handles fractional All conv. (view-through conversions)', () => {
    const rows = parseGoogleCampaignCsv(csv);
    const pmaxRow = rows.find(r => r.campaign.includes('PMAX') && r.date === '2026-01-01');
    expect(pmaxRow.conversions).toBe(55);
  });

  it('preserves campaign_type field', () => {
    const rows = parseGoogleCampaignCsv(csv);
    const types = [...new Set(rows.map(r => r.campaign_type))];
    expect(types).toContain('Performance Max');
    expect(types).toContain('Search');
    expect(types).toContain('Shopping');
  });

  it('computes ROAS as revenue / spend', () => {
    const rows = parseGoogleCampaignCsv(csv);
    const r = rows.find(r => r.spend > 0 && r.revenue > 0);
    expect(r.roas).toBeCloseTo(r.revenue / r.spend, 4);
  });

  it('sets ROAS to null when spend is 0', () => {
    const rows = parseGoogleCampaignCsv(csv);
    const zeroSpend = rows.find(r => r.spend === 0);
    if (zeroSpend) expect(zeroSpend.roas).toBeNull();
  });
});

// ─── Meta Ad-grain parsing ─────────────────────────────────────────────────

describe('parseMetaAdsCsv', () => {
  const csv = readFixture('meta_sample.csv');

  it('parses all rows', () => {
    const rows = parseMetaAdsCsv(csv);
    expect(rows.length).toBe(30);
  });

  it('coerces "null" purchase values to 0 (not NaN)', () => {
    const rows = parseMetaAdsCsv(csv);
    for (const r of rows) {
      expect(Number.isFinite(r.conversions)).toBe(true);
      expect(Number.isFinite(r.revenue)).toBe(true);
      expect(Number.isFinite(r.spend)).toBe(true);
    }
  });

  it('counts purchases only from non-null rows', () => {
    const rows = parseMetaAdsCsv(csv);
    const totalPurchases = rows.reduce((s, r) => s + r.conversions, 0);
    expect(totalPurchases).toBeGreaterThan(0);
    expect(totalPurchases).toBe(17);
  });

  it('parses "Apr 27, 2026" date format correctly', () => {
    const rows = parseMetaAdsCsv(csv);
    const dates = [...new Set(rows.map(r => r.date))];
    expect(dates).toContain('2026-04-27');
    expect(dates).toContain('2026-01-01');
  });

  it('derives campaign from ad name', () => {
    const rows = parseMetaAdsCsv(csv);
    const retargeting = rows.find(r => r.ad_name.includes('RETARGETING'));
    expect(retargeting.campaign).toBe('RETARGETING');
    const manual = rows.find(r => r.ad_name.includes('Manual Ad'));
    expect(manual.campaign).toBe('Manual Ad - fitwithnikk_');
  });

  it('uses ROAS to derive revenue when purchase value is null but ROAS exists', () => {
    const rows = parseMetaAdsCsv(csv);
    for (const r of rows) {
      if (r.roas !== null && r.roas > 0 && r.spend > 0) {
        expect(r.revenue).toBeGreaterThan(0);
      }
    }
  });
});

// ─── deriveMetaCampaign() ──────────────────────────────────────────────────

describe('deriveMetaCampaign', () => {
  it('extracts first segment before " - "', () => {
    expect(deriveMetaCampaign('DEODORANT - Performance - Fresh - Ad V2')).toBe('DEODORANT');
  });

  it('keeps "Manual Ad - creatorHandle" together', () => {
    expect(deriveMetaCampaign('Manual Ad - fitwithnikk_ - Story')).toBe('Manual Ad - fitwithnikk_');
  });

  it('returns full name when no separator', () => {
    expect(deriveMetaCampaign('SingleSegment')).toBe('SingleSegment');
  });

  it('handles empty/null input', () => {
    expect(deriveMetaCampaign('')).toBe('');
    expect(deriveMetaCampaign(null)).toBe('');
  });
});

// ─── parseAdsCsv() — public entry point ───────────────────────────────────

describe('parseAdsCsv', () => {
  it('returns { platform, rows, totalSpend, rowCount, dateRange } for Google', () => {
    const csv = readFixture('google_sample.csv');
    const result = parseAdsCsv(csv);
    expect(result.platform).toBe('google');
    expect(result.rows.length).toBe(30);
    expect(result.rowCount).toBe(30);
    expect(result.totalSpend).toBeGreaterThan(0);
    expect(result.dateRange.start).toBe('2026-01-01');
    expect(result.dateRange.end).toBe('2026-01-10');
  });

  it('returns correct shape for Meta', () => {
    const csv = readFixture('meta_sample.csv');
    const result = parseAdsCsv(csv);
    expect(result.platform).toBe('meta');
    expect(result.rows.length).toBe(30);
    expect(result.totalSpend).toBeGreaterThan(0);
  });

  it('throws DeprecatedAdsCsvFormat for old Google Ad-grain CSV', () => {
    const csv = readFixture('google_ad_grain_deprecated.csv');
    expect(() => parseAdsCsv(csv)).toThrow(DeprecatedAdsCsvFormat);
  });

  it('throws UnknownAdsCsvFormat for unrecognized CSV', () => {
    expect(() => parseAdsCsv('Foo,Bar\n1,2')).toThrow(UnknownAdsCsvFormat);
  });
});

// ─── aggregateRowsByDay() ──────────────────────────────────────────────────

describe('aggregateRowsByDay', () => {
  it('aggregates Google rows into daily totals', () => {
    const csv = readFixture('google_sample.csv');
    const rows = parseGoogleCampaignCsv(csv);
    const agg = aggregateRowsByDay(rows);

    expect(agg.platform).toBe('google');
    expect(agg.daysCount).toBe(10);
    expect(agg.totalSpend).toBeGreaterThan(0);

    const day1 = agg.dailyData['2026-01-01'];
    expect(day1).toBeDefined();
    expect(day1.spend).toBeCloseTo(26.13 + 17.23 + 12.50, 1);
    expect(day1.clicks).toBe(10 + 15 + 20);
    expect(day1.impressions).toBe(996 + 359 + 1200);
  });

  it('Google daily has ctr, cpc, costPerConv, roas fields', () => {
    const csv = readFixture('google_sample.csv');
    const rows = parseGoogleCampaignCsv(csv);
    const agg = aggregateRowsByDay(rows);
    const day = Object.values(agg.dailyData)[0];
    expect(day).toHaveProperty('ctr');
    expect(day).toHaveProperty('cpc');
    expect(day).toHaveProperty('costPerConv');
    expect(day).toHaveProperty('roas');
    expect(day).toHaveProperty('convValue');
  });

  it('aggregates Meta rows into daily totals with purchases/purchaseValue', () => {
    const csv = readFixture('meta_sample.csv');
    const rows = parseMetaAdsCsv(csv);
    const agg = aggregateRowsByDay(rows);

    expect(agg.platform).toBe('meta');
    const day = Object.values(agg.dailyData)[0];
    expect(day).toHaveProperty('purchases');
    expect(day).toHaveProperty('purchaseValue');
    expect(day).toHaveProperty('cpm');
  });

  it('returns empty result for empty array', () => {
    const agg = aggregateRowsByDay([]);
    expect(agg.dailyData).toEqual({});
    expect(agg.daysCount).toBe(0);
  });
});

// ─── checkReconciliation() ─────────────────────────────────────────────────

describe('checkReconciliation', () => {
  it('passes when within 0.5% tolerance', () => {
    const result = checkReconciliation(100.00, 100.40);
    expect(result.ok).toBe(true);
  });

  it('fails when exceeding 0.5% tolerance', () => {
    const result = checkReconciliation(100.00, 101.00);
    expect(result.ok).toBe(false);
    expect(result.pct).toBeGreaterThan(0.5);
  });

  it('returns ok=true when no expected total provided', () => {
    const result = checkReconciliation(500.00, 0);
    expect(result.ok).toBe(true);
  });
});

// ─── Backward-compat parseGoogleRows() ────────────────────────────────────

describe('parseGoogleRows (backward-compat wrapper)', () => {
  it('rejects Ad-grain format (has Ad ID column)', () => {
    const headers = ['Day', 'Campaign', 'Ad ID', 'Cost', 'Impressions', 'Clicks'];
    const rows = [['2026-01-01', 'Test', '123', '10', '100', '5']];
    expect(() => parseGoogleRows(rows, headers)).toThrow(DeprecatedAdsCsvFormat);
  });

  it('accepts campaign-grain format and returns aggregated daily data', () => {
    const headers = ['Day', 'Campaign', 'Campaign type', 'Currency code', 'Cost / all conv.', 'Impr.', 'Clicks', 'All conv.', 'Conv. value', 'Cost'];
    const rows = [
      ['2026-01-01', 'PMax', 'Performance Max', 'USD', '0.50', '1000', '10', '50', '40', '25'],
      ['2026-01-01', 'Search', 'Search', 'USD', '1.00', '500', '15', '10', '60', '15'],
    ];
    const result = parseGoogleRows(rows, headers);
    expect(result.dailyData['2026-01-01']).toBeDefined();
    expect(result.dailyData['2026-01-01'].spend).toBeCloseTo(40, 0);
    expect(result.daysCount).toBe(1);
  });
});

// ─── sanitizeDayAdsMetrics() ────────────────────────────────────────────────

describe('sanitizeDayAdsMetrics', () => {
  it('coerces string "null" in flat fields to 0', () => {
    const day = { metaPurchases: 'null', metaSpend: 12.5, googleSpend: 'NULL' };
    sanitizeDayAdsMetrics(day);
    expect(day.metaPurchases).toBe(0);
    expect(day.metaSpend).toBe(12.5);
    expect(day.googleSpend).toBe(0);
  });

  it('coerces NaN in adsMetrics to 0', () => {
    const day = { shopify: { adsMetrics: { metaPurchases: NaN, metaClicks: 5 } } };
    sanitizeDayAdsMetrics(day);
    expect(day.shopify.adsMetrics.metaPurchases).toBe(0);
    expect(day.shopify.adsMetrics.metaClicks).toBe(5);
  });

  it('coerces string "null" in nested adsMetrics to 0', () => {
    const day = {
      shopify: {
        adsMetrics: {
          metaPurchases: 'null',
          metaPurchaseValue: 'null',
          metaImpressions: 3500,
          metaROAS: 'Null',
        },
      },
    };
    sanitizeDayAdsMetrics(day);
    expect(day.shopify.adsMetrics.metaPurchases).toBe(0);
    expect(day.shopify.adsMetrics.metaPurchaseValue).toBe(0);
    expect(day.shopify.adsMetrics.metaImpressions).toBe(3500);
    expect(day.shopify.adsMetrics.metaROAS).toBe(0);
  });

  it('handles null/undefined day gracefully', () => {
    expect(sanitizeDayAdsMetrics(null)).toBeNull();
    expect(sanitizeDayAdsMetrics(undefined)).toBeUndefined();
  });
});

// ─── Full integration: fixture → parseAdsCsv → aggregateRowsByDay ─────────

describe('Full pipeline integration', () => {
  it('Google: fixture → per-row → daily aggregation round-trips correctly', () => {
    const csv = readFixture('google_sample.csv');
    const result = parseAdsCsv(csv);
    const agg = aggregateRowsByDay(result.rows);

    expect(agg.totalSpend).toBeCloseTo(result.totalSpend, 2);
    expect(agg.daysCount).toBe(10);

    for (const day of Object.values(agg.dailyData)) {
      expect(day.spend).toBeGreaterThan(0);
      expect(Number.isFinite(day.ctr)).toBe(true);
      expect(Number.isFinite(day.roas)).toBe(true);
    }
  });

  it('Meta: fixture → per-row → daily aggregation with no NaN fields', () => {
    const csv = readFixture('meta_sample.csv');
    const result = parseAdsCsv(csv);
    const agg = aggregateRowsByDay(result.rows);

    for (const day of Object.values(agg.dailyData)) {
      for (const [key, val] of Object.entries(day)) {
        if (key === 'date') continue;
        expect(Number.isFinite(val)).toBe(true);
      }
    }

    const totalPurchases = Object.values(agg.dailyData).reduce((s, d) => s + d.purchases, 0);
    expect(totalPurchases).toBe(17);
  });

  it('Meta: 30-day synthetic CSV with 91% nulls — purchases >= 10', () => {
    const lines = ['Date,Ad name,Amount spent,Value:Paid Purchases,Paid Purchases,Cost:Paid Purchases,Purchase (ROAS) (all),Impressions,Link clicks,CTR (all),Cost per link click,CPM'];
    let expected = 0;
    for (let d = 1; d <= 30; d++) {
      for (let a = 0; a < 12; a++) {
        const date = `Apr ${d}, 2026`;
        const spend = (5 + d * 0.3).toFixed(2);
        if (a === 0) {
          const purch = 1 + (d % 3);
          expected += purch;
          lines.push(`"${date}",Ad${a} - Camp${a % 3},${spend},${(purch * 33).toFixed(2)},${purch},${(spend / purch).toFixed(2)},${(purch * 33 / spend).toFixed(2)},2000,20,1.0,0.25,3.0`);
        } else {
          lines.push(`"${date}",Ad${a} - Camp${a % 3},${spend},null,null,null,null,2000,20,1.0,0.25,3.0`);
        }
      }
    }
    const csv = lines.join('\n');
    const result = parseAdsCsv(csv);
    const agg = aggregateRowsByDay(result.rows);
    const totalPurchases = Object.values(agg.dailyData).reduce((s, d) => s + d.purchases, 0);
    expect(totalPurchases).toBe(expected);
    expect(totalPurchases).toBeGreaterThanOrEqual(10);
  });
});
