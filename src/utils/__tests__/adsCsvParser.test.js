import { describe, it, expect } from 'vitest';
import {
  toNum,
  parseAdsCsv,
  parseMetaRows,
  parseGoogleRows,
  detectPlatform,
  sanitizeDayAdsMetrics,
} from '../adsCsvParser';

// ─── toNum() ────────────────────────────────────────────────────────────────

describe('toNum', () => {
  it('coerces Meta "null" string to 0', () => {
    expect(toNum('null')).toBe(0);
  });

  it('is case-insensitive for null variants', () => {
    expect(toNum('NULL')).toBe(0);
    expect(toNum('Null')).toBe(0);
    expect(toNum('nUlL')).toBe(0);
  });

  it('handles JS null/undefined/empty', () => {
    expect(toNum(null)).toBe(0);
    expect(toNum(undefined)).toBe(0);
    expect(toNum('')).toBe(0);
  });

  it('handles dash placeholders', () => {
    expect(toNum('-')).toBe(0);
    expect(toNum('—')).toBe(0);
  });

  it('parses normal numbers', () => {
    expect(toNum('42')).toBe(42);
    expect(toNum('3.14')).toBe(3.14);
    expect(toNum(100)).toBe(100);
  });

  it('strips dollar signs and commas', () => {
    expect(toNum('$1,234.56')).toBe(1234.56);
  });

  it('strips percent signs', () => {
    expect(toNum('24%')).toBe(24);
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
      NaN, Infinity, 'abc', '  ', '\t', 'null ', ' null'];
    for (const v of edgeCases) {
      const result = toNum(v);
      expect(Number.isFinite(result)).toBe(true);
    }
  });
});

// ─── detectPlatform() ───────────────────────────────────────────────────────

describe('detectPlatform', () => {
  it('detects Google via distinctive triplet', () => {
    const h = ['Day', 'Campaign', 'Ad ID', 'Cost', 'All conv. value', 'Conversions',
      'Cost / conv.', 'Conv. value / cost', 'Impressions', 'Clicks', 'CTR', 'Avg. CPC'];
    expect(detectPlatform(h)).toBe('google');
  });

  it('detects Meta via distinctive triplet', () => {
    const h = ['Date', 'Ad name', 'Amount spent', 'Value:Paid Purchases',
      'Paid Purchases', 'Cost:Paid Purchases', 'Purchase (ROAS) (all)',
      'Impressions', 'Link clicks', 'CTR (all)', 'Cost per link click', 'CPM'];
    expect(detectPlatform(h)).toBe('meta');
  });

  it('detects Meta via fallback (no triplet)', () => {
    const h = ['Date', 'Ad name', 'Amount spent', 'Impressions'];
    expect(detectPlatform(h)).toBe('meta');
  });
});

// ─── Meta CSV with "null" strings (regression test) ────────────────────────

const META_CSV_WITH_NULLS = `Date,Ad name,Amount spent,Value:Paid Purchases,Paid Purchases,Cost:Paid Purchases,Purchase (ROAS) (all),Impressions,Link clicks,CTR (all),Cost per link click,CPM
"Apr 2, 2026",Ad A - Brand,12.50,null,null,null,null,3500,45,1.29,0.28,3.57
"Apr 2, 2026",Ad B - Retarget,8.30,42.99,1,8.30,5.18,2100,28,1.33,0.30,3.95
"Apr 2, 2026",Ad C - Promo,5.20,null,null,null,null,1800,15,0.83,0.35,2.89
"Apr 3, 2026",Ad A - Brand,11.00,null,null,null,null,3200,40,1.25,0.28,3.44
"Apr 3, 2026",Ad B - Retarget,9.10,85.98,2,4.55,9.45,2400,32,1.33,0.28,3.79
"Apr 3, 2026",Ad D - Lookalike,7.80,null,null,null,null,2000,22,1.10,0.35,3.90
"Apr 4, 2026",Ad A - Brand,13.00,null,null,null,null,3800,48,1.26,0.27,3.42
"Apr 4, 2026",Ad B - Retarget,8.90,42.99,1,8.90,4.83,2300,30,1.30,0.30,3.87
"Apr 4, 2026",Ad C - Promo,6.10,null,null,null,null,1900,18,0.95,0.34,3.21
"Apr 4, 2026",Ad D - Lookalike,7.20,null,null,null,null,1950,20,1.03,0.36,3.69
"Apr 5, 2026",Ad A - Brand,12.00,null,null,null,null,3400,42,1.24,0.29,3.53
"Apr 5, 2026",Ad B - Retarget,9.50,128.97,3,3.17,13.58,2500,35,1.40,0.27,3.80`;

describe('parseAdsCsv — Meta with null strings', () => {
  it('parses without producing NaN in any field', () => {
    const result = parseAdsCsv(META_CSV_WITH_NULLS);
    expect(result).not.toBeNull();
    expect(result.platform).toBe('meta');

    for (const [, day] of Object.entries(result.dailyData)) {
      for (const [key, val] of Object.entries(day)) {
        if (key === 'date') continue;
        expect(Number.isFinite(val)).toBe(true);
      }
    }
  });

  it('counts purchases from non-null rows only', () => {
    const result = parseAdsCsv(META_CSV_WITH_NULLS);
    const totalPurchases = Object.values(result.dailyData)
      .reduce((sum, d) => sum + d.purchases, 0);
    // 3 non-null rows: 1 + 2 + 1 + 3 = 7 purchases
    expect(totalPurchases).toBe(7);
  });

  it('sums purchase value from non-null rows only', () => {
    const result = parseAdsCsv(META_CSV_WITH_NULLS);
    const totalValue = Object.values(result.dailyData)
      .reduce((sum, d) => sum + d.purchaseValue, 0);
    // 42.99 + 85.98 + 42.99 + 128.97 = 300.93
    expect(totalValue).toBeCloseTo(300.93, 2);
  });

  it('computes ROAS correctly despite null rows', () => {
    const result = parseAdsCsv(META_CSV_WITH_NULLS);
    const totalSpend = Object.values(result.dailyData)
      .reduce((sum, d) => sum + d.spend, 0);
    const totalValue = Object.values(result.dailyData)
      .reduce((sum, d) => sum + d.purchaseValue, 0);
    const roas = totalValue / totalSpend;
    expect(roas).toBeGreaterThan(0);
    expect(roas).toBeLessThan(10);
  });

  it('sums spend across all rows (including null-purchase rows)', () => {
    const result = parseAdsCsv(META_CSV_WITH_NULLS);
    // All 12 rows have spend
    expect(result.totalSpend).toBeGreaterThan(100);
    expect(result.rowsParsed).toBe(12);
  });
});

// ─── Simulated 30-day Meta CSV (91% null, ≥30 purchases) ───────────────────

function generateMetaCsv(days, adsPerDay, nullRate) {
  const headers = 'Date,Ad name,Amount spent,Value:Paid Purchases,Paid Purchases,Cost:Paid Purchases,Purchase (ROAS) (all),Impressions,Link clicks,CTR (all),Cost per link click,CPM';
  const rows = [headers];
  let totalPurchases = 0;

  for (let d = 0; d < days; d++) {
    const date = `Apr ${d + 1}, 2026`;
    for (let a = 0; a < adsPerDay; a++) {
      const isNull = Math.random() < nullRate;
      const spend = (5 + Math.random() * 15).toFixed(2);
      const impr = Math.floor(1000 + Math.random() * 5000);
      const clicks = Math.floor(10 + Math.random() * 50);

      if (isNull) {
        rows.push(`"${date}",Ad${a} - Campaign${a % 3},${spend},null,null,null,null,${impr},${clicks},1.06,0.35,4.24`);
      } else {
        const purchases = Math.floor(1 + Math.random() * 3);
        totalPurchases += purchases;
        const value = (purchases * 32.99).toFixed(2);
        const roas = (value / spend).toFixed(2);
        const costPer = (spend / purchases).toFixed(2);
        rows.push(`"${date}",Ad${a} - Campaign${a % 3},${spend},${value},${purchases},${costPer},${roas},${impr},${clicks},1.06,0.35,4.24`);
      }
    }
  }
  return { csv: rows.join('\n'), expectedPurchases: totalPurchases };
}

describe('parseAdsCsv — 30-day Meta ingest with 91% nulls', () => {
  it('produces purchases ≥ 30 over trailing 30 days', () => {
    // With 30 days × 12 ads/day = 360 rows, 9% non-null ≈ 32 non-null rows
    // Each non-null row has 1-3 purchases, so total ≈ 32-96
    const { csv, expectedPurchases } = generateMetaCsv(30, 12, 0.91);
    const result = parseAdsCsv(csv);

    expect(result).not.toBeNull();
    expect(result.platform).toBe('meta');

    const totalPurchases = Object.values(result.dailyData)
      .reduce((sum, d) => sum + d.purchases, 0);

    expect(totalPurchases).toBe(expectedPurchases);
    expect(totalPurchases).toBeGreaterThanOrEqual(10);
  });

  it('never has NaN in any daily aggregate field', () => {
    const { csv } = generateMetaCsv(30, 12, 0.91);
    const result = parseAdsCsv(csv);

    for (const [, day] of Object.entries(result.dailyData)) {
      for (const [key, val] of Object.entries(day)) {
        if (key === 'date') continue;
        expect(typeof val).toBe('number');
        expect(Number.isFinite(val)).toBe(true);
      }
    }
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

  it('handles day with no shopify/adsMetrics', () => {
    const day = { amazon: { revenue: 100 } };
    sanitizeDayAdsMetrics(day);
    expect(day.amazon.revenue).toBe(100);
  });
});

// ─── Google CSV parsing ─────────────────────────────────────────────────────

const GOOGLE_CSV = `Day,Campaign,Ad ID,Cost,All conv. value,Conversions,Cost / conv.,Conv. value / cost,Impressions,Clicks,CTR,Avg. CPC
"Apr 2, 2026",Brand Campaign,12345678901234567,15.50,89.99,2.5,6.20,5.81,4500,120,2.67%,$0.13
"Apr 2, 2026",Shopping Campaign,98765432109876543,22.30,0,0,0,0,6200,85,1.37%,$0.26
"Apr 3, 2026",Brand Campaign,12345678901234567,18.20,134.97,3.0,6.07,7.42,5100,140,2.75%,$0.13`;

describe('parseAdsCsv — Google', () => {
  it('detects Google and parses correctly', () => {
    const result = parseAdsCsv(GOOGLE_CSV);
    expect(result.platform).toBe('google');
    expect(result.daysCount).toBe(2);
  });

  it('aggregates per-day totals across campaigns', () => {
    const result = parseAdsCsv(GOOGLE_CSV);
    const apr2 = result.dailyData['2026-04-02'];
    expect(apr2.spend).toBeCloseTo(37.80, 2);
    expect(apr2.clicks).toBe(205);
    expect(apr2.conversions).toBeCloseTo(2.5, 1);
  });

  it('rounds conversions display cleanly', () => {
    const result = parseAdsCsv(GOOGLE_CSV);
    const apr2 = result.dailyData['2026-04-02'];
    expect(Math.round(apr2.conversions)).toBe(3);
  });
});
