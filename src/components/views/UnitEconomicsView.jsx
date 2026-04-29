import React, { useMemo, useState } from 'react';
import {
  AlertTriangle, DollarSign, Info, Repeat, Target, TrendingUp, Users, Zap,
} from 'lucide-react';
import { formatCurrency, formatNumber, formatPercent } from '../../utils/format';
import NavTabs from '../ui/NavTabs';

const TIME_RANGES = [
  { key: '30', label: 'Last 30 days', days: 30 },
  { key: '90', label: 'Last 90 days', days: 90 },
  { key: '180', label: 'Last 180 days', days: 180 },
  { key: '365', label: 'Last 365 days', days: 365 },
];

const PROCESSING_FEE_PCT = 0.029;
const PROCESSING_FEE_FIXED = 0.30;

const Section = ({ title, subtitle, children }) => (
  <div className="mb-8">
    <div className="mb-3">
      <h2 className="text-lg font-semibold">{title}</h2>
      {subtitle && <p className="text-xs text-slate-500">{subtitle}</p>}
    </div>
    {children}
  </div>
);

const MetricCard = ({ icon: Icon, label, value, sub, tone = 'neutral', tooltip }) => {
  const toneClass = {
    good: 'border-emerald-500/30 bg-emerald-900/10',
    warn: 'border-amber-500/30 bg-amber-900/10',
    bad: 'border-rose-500/30 bg-rose-900/10',
    neutral: 'border-slate-700 bg-slate-800/50',
  }[tone];

  const valueClass = {
    good: 'text-emerald-400',
    warn: 'text-amber-400',
    bad: 'text-rose-400',
    neutral: 'text-white',
  }[tone];

  return (
    <div className={`p-4 rounded-2xl border ${toneClass}`} title={tooltip}>
      <div className="flex items-center gap-2 text-slate-400 text-xs uppercase tracking-wide mb-2">
        {Icon && <Icon className="w-4 h-4" />}
        <span>{label}</span>
      </div>
      <div className={`text-2xl font-bold ${valueClass}`}>{value}</div>
      {sub && <div className="text-xs text-slate-500 mt-1">{sub}</div>}
    </div>
  );
};

const CostBar = ({ label, value, total, color, showAmount }) => {
  const pct = total > 0 ? Math.min(100, (value / total) * 100) : 0;
  return (
    <div className="mb-2">
      <div className="flex items-center justify-between text-xs mb-1">
        <span className="text-slate-300">{label}</span>
        <span className="text-slate-400">
          {showAmount && formatCurrency(value)}
          <span className="ml-2 text-slate-500">{pct.toFixed(1)}%</span>
        </span>
      </div>
      <div className="h-2 bg-slate-900 rounded-full overflow-hidden">
        <div className={`h-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
};

const UnitEconomicsView = ({
  allDaysData = {},
  allWeeksData = {},
  allPeriodsData = {},
  appSettings,
  bankingData,
  customerCohorts = [],
  dataBar,
  globalModals,
  hasDailySalesData,
  invHistory,
  navDropdown,
  savedCogs = {},
  setNavDropdown,
  setSelectedDay,
  setSelectedInvDate,
  setSelectedPeriod,
  setSelectedWeek,
  setUploadTab,
  setView,
  view,
}) => {
  const [rangeKey, setRangeKey] = useState('90');
  const [marketingMix, setMarketingMix] = useState('paid');

  const range = TIME_RANGES.find(r => r.key === rangeKey) || TIME_RANGES[1];

  const lookupCogs = (rawSku) => {
    const sku = (rawSku || '').toString().trim();
    if (!sku) return 0;
    const pick = (k) => {
      const v = savedCogs[k];
      if (typeof v === 'number') return v;
      if (v && typeof v.cost === 'number') return v.cost;
      return 0;
    };
    let c = pick(sku);
    if (c) return c;
    const compact = sku.replace(/\s+/g, '');
    c = pick(compact);
    if (c) return c;
    const base = compact.replace(/shop$/i, '');
    for (const k of [base, base + 'Shop', base.toUpperCase(), (base + 'Shop').toUpperCase(), base.toLowerCase(), (base + 'Shop').toLowerCase()]) {
      c = pick(k);
      if (c) return c;
    }
    return 0;
  };

  const computeDayCogs = (day) => {
    const s = day.shopify || {};
    const a = day.amazon || {};
    let storedCogs = (s.cogs || 0) + (a.cogs || 0);
    if (storedCogs > 0) return storedCogs;
    let computed = 0;
    (s.skuData || []).forEach(item => {
      const unitCost = lookupCogs(item.sku);
      const units = item.unitsSold || item.units || 0;
      computed += unitCost * units;
    });
    (a.skuData || []).forEach(item => {
      const unitCost = lookupCogs(item.sku);
      const units = item.unitsSold || item.units || 0;
      computed += unitCost * units;
    });
    return computed;
  };

  const metrics = useMemo(() => {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - range.days);
    const cutoffKey = cutoff.toISOString().split('T')[0];

    const days = Object.entries(allDaysData)
      .filter(([key]) => key >= cutoffKey)
      .map(([, day]) => day);

    let revenue = 0;
    let netSales = 0;
    let cogs = 0;
    let discounts = 0;
    let shipping = 0;
    let threeplCosts = 0;
    let units = 0;
    let orders = 0;
    let newCustomerOrders = 0;
    let returningCustomerOrders = 0;
    let metaSpend = 0;
    let googleSpend = 0;
    let amazonAdSpend = 0;
    let amazonRevenue = 0;
    let totalAdSpend = 0;

    days.forEach(day => {
      const s = day.shopify || {};
      const a = day.amazon || {};
      revenue += (s.revenue || 0) + (a.revenue || 0);
      netSales += s.netSales || 0;
      cogs += computeDayCogs(day);
      discounts += s.discounts || 0;
      shipping += s.shippingCollected || s.shipping || 0;
      threeplCosts += s.threeplCosts || 0;
      units += (s.units || 0) + (a.units || 0);
      orders += s.orders || 0;
      newCustomerOrders += s.newCustomerOrders || 0;
      returningCustomerOrders += s.returningCustomerOrders || 0;
      metaSpend += s.metaSpend || 0;
      googleSpend += s.googleSpend || 0;
      amazonAdSpend += a.adSpend || 0;
      amazonRevenue += a.revenue || 0;
    });

    totalAdSpend = metaSpend + googleSpend + amazonAdSpend;
    const shopifyAdSpend = metaSpend + googleSpend;
    const shopifyRevenue = revenue - amazonRevenue;

    const processingFees = orders * PROCESSING_FEE_FIXED + revenue * PROCESSING_FEE_PCT;

    const contributionMargin = revenue > 0
      ? (revenue - cogs - threeplCosts - discounts - processingFees) / revenue
      : 0;
    const breakEvenROAS = contributionMargin > 0 ? 1 / contributionMargin : null;
    const contributionPerOrder = orders > 0
      ? (revenue - cogs - threeplCosts - discounts - processingFees) / orders
      : 0;

    const mer = totalAdSpend > 0 ? revenue / totalAdSpend : null;
    const blendedROAS = totalAdSpend > 0 ? revenue / totalAdSpend : null;

    const trackedOrders = newCustomerOrders + returningCustomerOrders;
    const newCustomerRate = trackedOrders > 0 ? newCustomerOrders / trackedOrders : null;
    const repeatRate = trackedOrders > 0 ? returningCustomerOrders / trackedOrders : null;

    const blendedCAC = orders > 0 ? totalAdSpend / orders : null;
    const newCustomerCAC = newCustomerOrders > 0
      ? (marketingMix === 'paid' ? shopifyAdSpend : totalAdSpend) / newCustomerOrders
      : null;

    const aov = orders > 0 ? revenue / orders : 0;

    const ltvCacRatio = (newCustomerCAC && contributionPerOrder > 0)
      ? contributionPerOrder / newCustomerCAC
      : null;

    const paybackOrders = (newCustomerCAC && contributionPerOrder > 0)
      ? newCustomerCAC / contributionPerOrder
      : null;

    return {
      revenue,
      netSales,
      cogs,
      discounts,
      shipping,
      threeplCosts,
      processingFees,
      units,
      orders,
      newCustomerOrders,
      returningCustomerOrders,
      metaSpend,
      googleSpend,
      amazonAdSpend,
      shopifyAdSpend,
      totalAdSpend,
      shopifyRevenue,
      amazonRevenue,
      contributionMargin,
      contributionPerOrder,
      breakEvenROAS,
      mer,
      blendedROAS,
      newCustomerRate,
      repeatRate,
      blendedCAC,
      newCustomerCAC,
      aov,
      ltvCacRatio,
      paybackOrders,
      hasCustomerData: trackedOrders > 0,
      hasCogs: cogs > 0 || Object.keys(savedCogs || {}).length > 0,
      hasAdSpend: totalAdSpend > 0,
    };
  }, [allDaysData, range.days, marketingMix, savedCogs]);

  const cohortRows = useMemo(() => {
    if (!customerCohorts || customerCohorts.length === 0) return [];
    return [...customerCohorts]
      .sort((a, b) => b.month.localeCompare(a.month))
      .slice(0, 12)
      .map(c => ({
        ...c,
        ltv: c.newCustomers > 0 ? c.totalRevenue / c.newCustomers : 0,
        ordersPerCustomer: c.newCustomers > 0 ? c.totalOrders / c.newCustomers : 0,
        repeatRate: c.newCustomers > 0 ? c.repeatCustomers / c.newCustomers : 0,
      }));
  }, [customerCohorts]);

  const alerts = useMemo(() => {
    const list = [];
    if (!metrics.hasCogs) {
      list.push({
        type: 'warning',
        text: 'No COGS data found. Break-even ROAS and contribution margin require COGS — upload COGS by SKU or set defaults.',
        link: 'upload',
      });
    }
    if (!metrics.hasAdSpend) {
      list.push({
        type: 'warning',
        text: 'No ad spend in this period. CAC and MER need ads data — connect Meta/Google/Amazon Ads or upload campaign reports.',
        link: 'ads',
      });
    }
    if (!metrics.hasCustomerData) {
      list.push({
        type: 'info',
        text: 'New vs returning customer split needs a fresh Shopify order sync. Sync orders to populate cohort data.',
        link: 'settings',
      });
    }
    if (metrics.ltvCacRatio !== null && metrics.ltvCacRatio < 1) {
      list.push({
        type: 'critical',
        text: `Contribution per order ($${metrics.contributionPerOrder.toFixed(2)}) is below CAC ($${metrics.newCustomerCAC?.toFixed(2)}). You're losing money on every new customer at current margins — they need to repurchase to break even.`,
      });
    }
    if (metrics.mer !== null && metrics.breakEvenROAS && metrics.mer < metrics.breakEvenROAS) {
      list.push({
        type: 'critical',
        text: `MER (${metrics.mer.toFixed(2)}x) is below break-even ROAS (${metrics.breakEvenROAS.toFixed(2)}x). You're spending more on ads than your contribution margin can absorb.`,
      });
    }
    return list;
  }, [metrics]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-white p-3 sm:p-4 lg:p-6">
      <div className="max-w-7xl mx-auto">
        {globalModals}
        <NavTabs
          view={view}
          setView={setView}
          navDropdown={navDropdown}
          setNavDropdown={setNavDropdown}
          appSettings={appSettings}
          allDaysData={allDaysData}
          allWeeksData={allWeeksData}
          allPeriodsData={allPeriodsData}
          hasDailySalesData={hasDailySalesData}
          setSelectedDay={setSelectedDay}
          setSelectedWeek={setSelectedWeek}
          setSelectedPeriod={setSelectedPeriod}
          invHistory={invHistory}
          setSelectedInvDate={setSelectedInvDate}
          setUploadTab={setUploadTab}
          bankingData={bankingData}
        />
        {dataBar}

        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-2">
              <Target className="w-7 h-7 text-violet-400" />
              Unit Economics
            </h1>
            <p className="text-slate-400 text-sm mt-1">
              CAC, LTV, MER, break-even ROAS — the numbers that decide whether your brand makes money.
            </p>
          </div>
          <div className="flex gap-2">
            <select
              value={rangeKey}
              onChange={(e) => setRangeKey(e.target.value)}
              className="bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-violet-500"
            >
              {TIME_RANGES.map(r => (
                <option key={r.key} value={r.key}>{r.label}</option>
              ))}
            </select>
            <select
              value={marketingMix}
              onChange={(e) => setMarketingMix(e.target.value)}
              className="bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-violet-500"
              title="Which ad spend to attribute to Shopify new customers"
            >
              <option value="paid">Shopify ad spend (Meta + Google)</option>
              <option value="blended">Blended (all channels)</option>
            </select>
          </div>
        </div>

        {alerts.length > 0 && (
          <div className="space-y-2 mb-6">
            {alerts.map((alert, i) => (
              <div
                key={i}
                className={`flex items-start gap-3 p-3 rounded-xl border ${
                  alert.type === 'critical'
                    ? 'bg-rose-900/30 border-rose-500/40 text-rose-200'
                    : alert.type === 'warning'
                    ? 'bg-amber-900/30 border-amber-500/40 text-amber-200'
                    : 'bg-sky-900/30 border-sky-500/40 text-sky-200'
                }`}
              >
                {alert.type === 'critical' ? <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                  : alert.type === 'warning' ? <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                  : <Info className="w-5 h-5 flex-shrink-0 mt-0.5" />}
                <div className="flex-1 text-sm">{alert.text}</div>
                {alert.link && (
                  <button
                    onClick={() => setView(alert.link)}
                    className="text-xs underline whitespace-nowrap"
                  >
                    Fix
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        <Section title="Top-line efficiency" subtitle="The numbers to watch every morning">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <MetricCard
              icon={Zap}
              label="MER"
              tooltip="Marketing Efficiency Ratio = Total Revenue / Total Ad Spend. Single most honest top-line number."
              value={metrics.mer !== null ? `${metrics.mer.toFixed(2)}x` : '—'}
              sub={`Revenue ${formatCurrency(metrics.revenue)} / Ad spend ${formatCurrency(metrics.totalAdSpend)}`}
              tone={metrics.mer === null ? 'neutral' : metrics.mer >= 3 ? 'good' : metrics.mer >= 2 ? 'warn' : 'bad'}
            />
            <MetricCard
              icon={Target}
              label="Break-even ROAS"
              tooltip="1 / contribution margin. Your ad ROAS needs to beat this to make money on the marginal dollar."
              value={metrics.breakEvenROAS !== null ? `${metrics.breakEvenROAS.toFixed(2)}x` : '—'}
              sub={`Contribution margin ${formatPercent(metrics.contributionMargin * 100)}`}
              tone="neutral"
            />
            <MetricCard
              icon={TrendingUp}
              label="Blended ROAS"
              tooltip="Same as MER but framed as ROAS. Compare to break-even ROAS to see if you're profitable on ads."
              value={metrics.blendedROAS !== null ? `${metrics.blendedROAS.toFixed(2)}x` : '—'}
              sub={metrics.breakEvenROAS && metrics.blendedROAS
                ? `vs break-even ${metrics.breakEvenROAS.toFixed(2)}x`
                : '—'}
              tone={metrics.blendedROAS && metrics.breakEvenROAS
                ? metrics.blendedROAS >= metrics.breakEvenROAS ? 'good' : 'bad'
                : 'neutral'}
            />
            <MetricCard
              icon={DollarSign}
              label="Contribution / order"
              tooltip="Revenue minus COGS, 3PL, discounts, payment processing — per order. The dollars left to cover CAC + overhead."
              value={formatCurrency(metrics.contributionPerOrder)}
              sub={`AOV ${formatCurrency(metrics.aov)}`}
              tone={metrics.contributionPerOrder > 0 ? 'good' : 'bad'}
            />
          </div>
        </Section>

        <Section title="Customer acquisition" subtitle="Three flavors of CAC — they tell different stories">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <MetricCard
              icon={Users}
              label="Blended CAC"
              tooltip="Total ad spend / total orders. Most honest number for a small brand. Treats every order like an acquisition cost."
              value={metrics.blendedCAC !== null ? formatCurrency(metrics.blendedCAC) : '—'}
              sub={`${formatNumber(metrics.orders)} orders / ${formatCurrency(metrics.totalAdSpend)} spent`}
              tone="neutral"
            />
            <MetricCard
              icon={Users}
              label="New customer CAC"
              tooltip={`${marketingMix === 'paid' ? 'Shopify ad spend' : 'Total ad spend'} / first-time buyers. The number that actually matters for unit economics.`}
              value={metrics.newCustomerCAC !== null ? formatCurrency(metrics.newCustomerCAC) : '—'}
              sub={metrics.hasCustomerData
                ? `${formatNumber(metrics.newCustomerOrders)} new customers`
                : 'Sync orders to enable'}
              tone={metrics.newCustomerCAC === null ? 'neutral'
                : metrics.contributionPerOrder > metrics.newCustomerCAC ? 'good' : 'bad'}
            />
            <MetricCard
              icon={Repeat}
              label="Repeat purchase rate"
              tooltip="% of orders from returning customers. Leading indicator of LTV. >25% is healthy for most categories."
              value={metrics.repeatRate !== null ? formatPercent(metrics.repeatRate * 100) : '—'}
              sub={metrics.hasCustomerData
                ? `${formatNumber(metrics.returningCustomerOrders)} returning orders`
                : 'Sync orders to enable'}
              tone={metrics.repeatRate === null ? 'neutral'
                : metrics.repeatRate >= 0.25 ? 'good' : metrics.repeatRate >= 0.15 ? 'warn' : 'bad'}
            />
          </div>
        </Section>

        <Section title="LTV : CAC" subtitle="The ratio every investor will ask about">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <MetricCard
              icon={TrendingUp}
              label="First-order LTV : CAC"
              tooltip="Contribution per order / new customer CAC. >1.0 means you make money on the first order alone."
              value={metrics.ltvCacRatio !== null ? `${metrics.ltvCacRatio.toFixed(2)}x` : '—'}
              sub="Healthy: >1.0 first-order, >3.0 lifetime"
              tone={metrics.ltvCacRatio === null ? 'neutral'
                : metrics.ltvCacRatio >= 1 ? 'good' : 'bad'}
            />
            <MetricCard
              icon={Target}
              label="Payback (orders)"
              tooltip="How many orders the average new customer needs to place before you've recouped CAC. <2 is excellent."
              value={metrics.paybackOrders !== null ? `${metrics.paybackOrders.toFixed(1)} orders` : '—'}
              sub="Lower is better"
              tone={metrics.paybackOrders === null ? 'neutral'
                : metrics.paybackOrders <= 1 ? 'good' : metrics.paybackOrders <= 2 ? 'warn' : 'bad'}
            />
            <MetricCard
              icon={Users}
              label="New customer share"
              tooltip="% of orders from first-time buyers. High = growing but dependent on paid acquisition. Low = strong retention."
              value={metrics.newCustomerRate !== null ? formatPercent(metrics.newCustomerRate * 100) : '—'}
              sub={metrics.hasCustomerData ? 'Of tracked orders' : 'Sync orders to enable'}
              tone="neutral"
            />
          </div>
        </Section>

        <Section title="Cost breakdown" subtitle={`What ${formatCurrency(metrics.revenue)} of revenue actually leaves on the table`}>
          <div className="bg-slate-800/50 border border-slate-700 rounded-2xl p-4">
            <CostBar label="Revenue" value={metrics.revenue} total={metrics.revenue} color="bg-emerald-500" showAmount />
            <CostBar label="COGS" value={metrics.cogs} total={metrics.revenue} color="bg-amber-500" showAmount />
            <CostBar label="3PL fulfillment" value={metrics.threeplCosts} total={metrics.revenue} color="bg-orange-500" showAmount />
            <CostBar label="Discounts" value={metrics.discounts} total={metrics.revenue} color="bg-rose-500" showAmount />
            <CostBar label="Payment processing (est.)" value={metrics.processingFees} total={metrics.revenue} color="bg-pink-500" showAmount />
            <CostBar label="Ad spend" value={metrics.totalAdSpend} total={metrics.revenue} color="bg-violet-500" showAmount />
            <div className="mt-3 pt-3 border-t border-slate-700 flex items-center justify-between">
              <span className="text-sm text-slate-300">Contribution after ads</span>
              <span className={`text-lg font-semibold ${
                (metrics.revenue - metrics.cogs - metrics.threeplCosts - metrics.discounts - metrics.processingFees - metrics.totalAdSpend) > 0
                  ? 'text-emerald-400' : 'text-rose-400'
              }`}>
                {formatCurrency(metrics.revenue - metrics.cogs - metrics.threeplCosts - metrics.discounts - metrics.processingFees - metrics.totalAdSpend)}
              </span>
            </div>
          </div>
        </Section>

        {cohortRows.length > 0 && (
          <Section title="Customer cohorts" subtitle="Grouped by first-order month — track LTV curves over time">
            <div className="bg-slate-800/50 border border-slate-700 rounded-2xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-900/50 text-slate-400 text-xs uppercase">
                    <tr>
                      <th className="px-4 py-3 text-left">Cohort month</th>
                      <th className="px-4 py-3 text-right">New customers</th>
                      <th className="px-4 py-3 text-right">Total orders</th>
                      <th className="px-4 py-3 text-right">Orders / customer</th>
                      <th className="px-4 py-3 text-right">Realized LTV</th>
                      <th className="px-4 py-3 text-right">Repeat rate</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cohortRows.map((c) => (
                      <tr key={c.month} className="border-t border-slate-700">
                        <td className="px-4 py-3 font-medium">{c.month}</td>
                        <td className="px-4 py-3 text-right">{formatNumber(c.newCustomers)}</td>
                        <td className="px-4 py-3 text-right">{formatNumber(c.totalOrders)}</td>
                        <td className="px-4 py-3 text-right">{c.ordersPerCustomer.toFixed(2)}</td>
                        <td className="px-4 py-3 text-right">{formatCurrency(c.ltv)}</td>
                        <td className="px-4 py-3 text-right">
                          <span className={c.repeatRate >= 0.2 ? 'text-emerald-400' : 'text-slate-300'}>
                            {formatPercent(c.repeatRate * 100)}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="px-4 py-3 text-xs text-slate-500 bg-slate-900/30">
                Realized LTV is cumulative revenue divided by cohort size. For a brand under ~2 years old, predicted LTV is mostly fiction — use these checkpoints (90 / 180 / 365 day) instead.
              </div>
            </div>
          </Section>
        )}

        <div className="text-xs text-slate-500 mt-6 px-2">
          Methodology: Revenue = item sales + shipping (excludes tax). Contribution margin = (Revenue − COGS − 3PL − discounts − payment processing) / Revenue. Payment processing assumed at 2.9% + $0.30/order. Break-even ROAS = 1 / contribution margin. CAC requires synced Shopify customer IDs.
        </div>
      </div>
    </div>
  );
};

export default UnitEconomicsView;
