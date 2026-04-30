import React, { useState, useMemo } from 'react';
import { Target, TrendingUp, TrendingDown, Users, DollarSign, ShoppingCart, RefreshCw, Info, AlertTriangle, ArrowRight } from 'lucide-react';
import { formatCurrency, formatPercent, formatNumber } from '../../utils/format';
import NavTabs from '../ui/NavTabs';

const UnitEconomicsView = ({
  allDaysData,
  allWeeksData,
  allPeriodsData,
  appSettings,
  bankingData,
  dataBar,
  globalModals,
  hasDailySalesData,
  invHistory,
  navDropdown,
  savedCogs,
  savedProductNames,
  setNavDropdown,
  setSelectedDay,
  setSelectedInvDate,
  setSelectedPeriod,
  setSelectedWeek,
  setUploadTab,
  setView,
  view,
}) => {
  const [period, setPeriod] = useState('30d');

  const periodDays = { '7d': 7, '14d': 14, '30d': 30, '90d': 90, '180d': 180, '365d': 365 };

  const metrics = useMemo(() => {
    const days = periodDays[period] || 30;
    const now = new Date();
    now.setHours(0, 0, 0, 0);

    const getDatesInRange = (daysBack, offset = 0) => {
      const dates = [];
      for (let i = offset; i < daysBack + offset; i++) {
        const d = new Date(now);
        d.setDate(d.getDate() - i - 1);
        dates.push(d.toISOString().split('T')[0]);
      }
      return dates;
    };

    const currentDates = getDatesInRange(days, 0);
    const priorDates = getDatesInRange(days, days);

    const aggregate = (dates) => {
      let totalRevenue = 0, shopifyRevenue = 0, amazonRevenue = 0;
      let shopifyOrders = 0, amazonUnits = 0;
      let newCustomers = 0, returningCustomers = 0;
      let newCustomerRevenue = 0, returningCustomerRevenue = 0;
      let amazonAdSpend = 0;
      let metaFromDaily = 0, googleFromDaily = 0;
      let totalCogs = 0;
      let totalDiscounts = 0;
      let totalShipping = 0;
      let daysWithData = 0;

      for (const date of dates) {
        const day = allDaysData[date];
        if (!day) continue;

        const shopDay = day.shopify || {};
        const amzDay = day.amazon || {};

        const shopRev = shopDay.revenue || shopDay.netSales || 0;
        const amzRev = amzDay.revenue || amzDay.sales || 0;

        if (shopRev > 0 || amzRev > 0) daysWithData++;

        shopifyRevenue += shopRev;
        amazonRevenue += amzRev;
        totalRevenue += shopRev + amzRev;

        shopifyOrders += shopDay.orders || 0;
        amazonUnits += amzDay.units || 0;

        newCustomers += shopDay.newCustomers || 0;
        returningCustomers += shopDay.returningCustomers || 0;
        newCustomerRevenue += shopDay.newCustomerRevenue || 0;
        returningCustomerRevenue += shopDay.returningCustomerRevenue || 0;

        amazonAdSpend += amzDay.adSpend || 0;
        metaFromDaily += shopDay.metaSpend ?? day.metaSpend ?? day.metaAds ?? 0;
        googleFromDaily += shopDay.googleSpend ?? day.googleSpend ?? day.googleAds ?? 0;

        totalDiscounts += shopDay.discounts || 0;
        totalShipping += shopDay.shippingCollected || 0;

        // Amazon COGS: use pre-calculated cogs from SKU economics reports, fall back to uploaded COGS file
        for (const sku of (amzDay.skuData || [])) {
          if (sku.cogs > 0) {
            totalCogs += sku.cogs;
          } else {
            const skuId = sku.sku || sku.SKU || '';
            const cost = savedCogs[skuId] || savedCogs[skuId.toUpperCase()] || savedCogs[skuId.toLowerCase()];
            if (cost) totalCogs += (parseFloat(cost) || 0) * (sku.unitsSold || sku.units || sku.quantity || 1);
          }
        }
        // Also use day-level Amazon COGS if no SKU-level data
        if (!(amzDay.skuData?.length) && (amzDay.cogs || 0) > 0) {
          totalCogs += amzDay.cogs;
        }

        // Shopify COGS: always from uploaded COGS file
        for (const sku of (shopDay.skuData || [])) {
          const skuId = sku.sku || sku.SKU || '';
          const cost = savedCogs[skuId] || savedCogs[skuId.toUpperCase()] || savedCogs[skuId.toLowerCase()];
          if (cost) totalCogs += (parseFloat(cost) || 0) * (sku.unitsSold || sku.units || sku.quantity || 1);
        }
      }

      // Also check weekly data for meta/google spend (covers manual weekly entries)
      let metaFromWeekly = 0, googleFromWeekly = 0;
      const weekKeys = Object.keys(allWeeksData || {}).sort();
      for (const wk of weekKeys) {
        const wkEnd = new Date(wk + 'T12:00:00');
        const wkStart = new Date(wkEnd);
        wkStart.setDate(wkStart.getDate() - 6);
        const rangeStart = new Date(dates[dates.length - 1] + 'T00:00:00');
        const rangeEnd = new Date(dates[0] + 'T23:59:59');
        if (wkEnd >= rangeStart && wkStart <= rangeEnd) {
          const sh = allWeeksData[wk]?.shopify || {};
          metaFromWeekly += parseFloat(sh.metaSpend || 0);
          googleFromWeekly += parseFloat(sh.googleSpend || 0);
        }
      }

      // Use whichever source found the spend (daily is more precise, weekly is fallback)
      const metaAdSpend = Math.max(metaFromDaily, metaFromWeekly);
      const googleAdSpend = Math.max(googleFromDaily, googleFromWeekly);

      const totalAdSpend = amazonAdSpend + metaAdSpend + googleAdSpend;
      const totalCustomers = newCustomers + returningCustomers;
      const estFees = shopifyRevenue * 0.026 + amazonRevenue * 0.15;
      const contributionProfit = totalRevenue - totalCogs - estFees - totalAdSpend;
      const contributionMargin = totalRevenue > 0 ? contributionProfit / totalRevenue : 0;

      return {
        totalRevenue, shopifyRevenue, amazonRevenue,
        shopifyOrders, amazonUnits,
        newCustomers, returningCustomers, totalCustomers,
        newCustomerRevenue, returningCustomerRevenue,
        amazonAdSpend, metaAdSpend, googleAdSpend, totalAdSpend,
        totalCogs, totalDiscounts, totalShipping, estFees,
        contributionProfit, contributionMargin,
        daysWithData,
        mer: totalAdSpend > 0 ? totalRevenue / totalAdSpend : 0,
        blendedCac: newCustomers > 0 ? totalAdSpend / newCustomers : 0,
        shopifyAov: shopifyOrders > 0 ? shopifyRevenue / shopifyOrders : 0,
        amazonAov: amazonUnits > 0 ? amazonRevenue / amazonUnits : 0,
        blendedAov: (shopifyOrders + amazonUnits) > 0 ? totalRevenue / (shopifyOrders + amazonUnits) : 0,
        repeatRate: totalCustomers > 0 ? (returningCustomers / totalCustomers) * 100 : 0,
        breakEvenRoas: contributionMargin > 0 ? 1 / contributionMargin : 0,
        ltvCacRatio: (newCustomers > 0 && totalCustomers > 0)
          ? (totalRevenue / totalCustomers) / (totalAdSpend / newCustomers) : 0,
      };
    };

    const current = aggregate(currentDates);
    const prior = aggregate(priorDates);

    const pctChange = (curr, prev) => {
      if (!prev || prev === 0) return null;
      return ((curr - prev) / Math.abs(prev)) * 100;
    };

    return { current, prior, pctChange };
  }, [allDaysData, allWeeksData, savedCogs, period]);

  const { current: m, prior: p, pctChange } = metrics;
  const hasCogs = Object.keys(savedCogs || {}).length > 0;
  const hasCustomerData = m.newCustomers > 0 || m.returningCustomers > 0;

  const MetricCard = ({ label, value, format = 'currency', prior, icon: Icon, color = 'slate', sublabel, large }) => {
    const formatted = format === 'currency' ? formatCurrency(value)
      : format === 'percent' ? formatPercent(value)
      : format === 'ratio' ? (value || 0).toFixed(2) + 'x'
      : format === 'roas' ? (value || 0).toFixed(2)
      : formatNumber(value);

    const change = prior !== undefined ? pctChange(value, prior) : null;
    const colorMap = {
      emerald: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
      cyan: 'text-cyan-400 bg-cyan-500/10 border-cyan-500/20',
      violet: 'text-violet-400 bg-violet-500/10 border-violet-500/20',
      amber: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
      rose: 'text-rose-400 bg-rose-500/10 border-rose-500/20',
      blue: 'text-blue-400 bg-blue-500/10 border-blue-500/20',
      slate: 'text-slate-300 bg-slate-500/10 border-slate-500/20',
    };
    const colors = colorMap[color] || colorMap.slate;

    return (
      <div className={`rounded-2xl border p-4 ${large ? 'col-span-2 sm:col-span-1' : ''} ${colors}`}>
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">{label}</span>
          {Icon && <Icon className="w-4 h-4 text-slate-500" />}
        </div>
        <div className={`font-bold ${large ? 'text-2xl' : 'text-xl'} text-white`}>{formatted}</div>
        {sublabel && <div className="text-xs text-slate-500 mt-0.5">{sublabel}</div>}
        {change !== null && !isNaN(change) && (
          <div className={`flex items-center gap-1 text-xs mt-1 ${change >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
            {change >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
            {Math.abs(change).toFixed(1)}% vs prior {period}
          </div>
        )}
      </div>
    );
  };

  const Section = ({ title, children, info }) => (
    <div className="mb-6">
      <div className="flex items-center gap-2 mb-3">
        <h3 className="text-white font-semibold text-sm uppercase tracking-wider">{title}</h3>
        {info && (
          <div className="group relative">
            <Info className="w-3.5 h-3.5 text-slate-500 cursor-help" />
            <div className="absolute bottom-full left-0 mb-1 hidden group-hover:block z-50 w-64 p-2 rounded-lg bg-slate-800 border border-slate-600 text-xs text-slate-300 shadow-xl">
              {info}
            </div>
          </div>
        )}
      </div>
      {children}
    </div>
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-white p-3 sm:p-4 lg:p-6">
      <div className="max-w-7xl mx-auto">
        {globalModals}
        <NavTabs view={view} setView={setView} navDropdown={navDropdown} setNavDropdown={setNavDropdown} appSettings={appSettings} allDaysData={allDaysData} allWeeksData={allWeeksData} allPeriodsData={allPeriodsData} hasDailySalesData={hasDailySalesData} setSelectedDay={setSelectedDay} setSelectedWeek={setSelectedWeek} setSelectedPeriod={setSelectedPeriod} invHistory={invHistory} setSelectedInvDate={setSelectedInvDate} setUploadTab={setUploadTab} bankingData={bankingData} />
        {dataBar}

        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-6">
          <div>
            <h1 className="text-2xl font-bold text-white flex items-center gap-2">
              <Target className="w-6 h-6 text-cyan-400" />
              Unit Economics
            </h1>
            <p className="text-slate-400 text-sm mt-1">CAC, LTV, MER, and the numbers that actually matter</p>
          </div>
          <div className="flex gap-1 bg-slate-800/50 rounded-xl p-1 border border-slate-700">
            {Object.keys(periodDays).map(p => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${
                  period === p ? 'bg-cyan-600 text-white' : 'text-slate-400 hover:text-white hover:bg-slate-700'
                }`}
              >
                {p}
              </button>
            ))}
          </div>
        </div>

        {/* Warnings */}
        {!hasCogs && (
          <div className="bg-amber-900/20 border border-amber-500/30 rounded-xl p-3 mb-4 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0" />
            <span className="text-sm text-amber-300">COGS not configured — contribution margin and break-even ROAS will be estimates.</span>
            <button onClick={() => { setView('upload'); setUploadTab?.('cogs'); }} className="ml-auto text-xs text-amber-400 hover:text-amber-300 flex items-center gap-1">
              Set up COGS <ArrowRight className="w-3 h-3" />
            </button>
          </div>
        )}
        {!hasCustomerData && (
          <div className="bg-blue-900/20 border border-blue-500/30 rounded-xl p-3 mb-4 flex items-center gap-2">
            <Info className="w-4 h-4 text-blue-400 flex-shrink-0" />
            <span className="text-sm text-blue-300">Customer data requires a fresh Shopify sync — existing data pre-dates customer tracking. Run a new sync to populate new vs. returning metrics, CAC, and LTV.</span>
          </div>
        )}

        {/* Top-line metrics */}
        <Section title="Marketing Efficiency" info="Blended metrics across all channels (Amazon, Meta, Google). MER is the single most honest number — it catches platform attribution lies.">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <MetricCard label="MER" value={m.mer} format="ratio" prior={p.mer} color="cyan" icon={Target}
              sublabel="Revenue ÷ Ad Spend" large />
            <MetricCard label="Total Ad Spend" value={m.totalAdSpend} prior={p.totalAdSpend} color="rose" icon={DollarSign}
              sublabel={[
                m.amazonAdSpend > 0 && `AMZ $${formatNumber(m.amazonAdSpend)}`,
                m.metaAdSpend > 0 && `Meta $${formatNumber(m.metaAdSpend)}`,
                m.googleAdSpend > 0 && `Google $${formatNumber(m.googleAdSpend)}`,
              ].filter(Boolean).join(' · ') || 'No spend data'} />
            <MetricCard label="Total Revenue" value={m.totalRevenue} prior={p.totalRevenue} color="emerald" icon={DollarSign}
              sublabel={`Shop ${formatCurrency(m.shopifyRevenue)} · AMZ ${formatCurrency(m.amazonRevenue)}`} />
            <MetricCard label="Break-even ROAS" value={m.breakEvenRoas} format="roas" color="amber" icon={Target}
              sublabel={hasCogs ? `CM: ${(m.contributionMargin * 100).toFixed(0)}%` : 'Estimate (no COGS)'} />
          </div>
        </Section>

        {/* Customer Acquisition */}
        <Section title="Customer Acquisition" info="Customer counts are from Shopify only (Amazon doesn't expose customer data). Blended CAC uses total ad spend across all channels.">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <MetricCard label="Blended CAC" value={m.blendedCac} prior={p.blendedCac} color="violet" icon={Users}
              sublabel="Ad Spend ÷ New Customers" large />
            <MetricCard label="New Customers" value={m.newCustomers} format="number" prior={p.newCustomers} color="cyan" icon={Users} />
            <MetricCard label="Returning Customers" value={m.returningCustomers} format="number" prior={p.returningCustomers} color="emerald" icon={RefreshCw} />
            <MetricCard label="Repeat Rate" value={m.repeatRate} format="percent" prior={p.repeatRate} color="blue" icon={RefreshCw}
              sublabel="Returning ÷ Total" />
          </div>
        </Section>

        {/* Order Economics */}
        <Section title="Order Economics" info="Shopify AOV = revenue ÷ orders. Amazon AOV = revenue ÷ units (Amazon doesn't expose order count, only units sold). Blended combines both.">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <MetricCard label="Shopify AOV" value={m.shopifyAov} prior={p.shopifyAov} color="cyan" icon={ShoppingCart}
              sublabel={`${formatNumber(m.shopifyOrders)} orders`} />
            <MetricCard label="Amazon AOV" value={m.amazonAov} prior={p.amazonAov} color="amber" icon={ShoppingCart}
              sublabel={`${formatNumber(m.amazonUnits)} units sold`} />
            <MetricCard label="Blended AOV" value={m.blendedAov} prior={p.blendedAov} color="emerald" icon={ShoppingCart}
              sublabel={`${formatNumber(m.shopifyOrders + m.amazonUnits)} total`} large />
          </div>
        </Section>

        {/* Contribution Margin & Unit Economics */}
        <Section title="Contribution Margin" info="Revenue minus COGS, estimated fees (Shopify 2.6%, Amazon 15%), and ad spend. This is what's left to pay for overhead and profit.">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <MetricCard label="Contribution Profit" value={m.contributionProfit} prior={p.contributionProfit} color="emerald" icon={DollarSign} large />
            <MetricCard label="Contribution Margin" value={m.contributionMargin * 100} format="percent" prior={p.contributionMargin * 100} color="cyan" />
            <MetricCard label="COGS" value={m.totalCogs} prior={p.totalCogs} color="rose" icon={DollarSign}
              sublabel={m.totalCogs > 0 ? `${(m.totalRevenue > 0 ? (m.totalCogs / m.totalRevenue * 100).toFixed(0) : 0)}% of revenue` : 'Upload COGS or SKU Economics'} />
            <MetricCard label="Est. Fees" value={m.estFees} prior={p.estFees} color="amber" icon={DollarSign}
              sublabel="Shopify 2.6% + AMZ 15%" />
          </div>
        </Section>

        {/* LTV & Payback */}
        <Section title="LTV & Payback" info="LTV:CAC should be ≥3.0 for a healthy business. Requires Shopify customer data (run a sync). True LTV needs 6+ months — use 180d or 365d lookback.">
          {hasCustomerData ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <MetricCard label="LTV:CAC Ratio" value={m.ltvCacRatio} format="ratio" color={m.ltvCacRatio >= 3 ? 'emerald' : m.ltvCacRatio >= 1 ? 'amber' : 'rose'} icon={Target}
                sublabel={m.ltvCacRatio >= 3 ? 'Healthy' : m.ltvCacRatio >= 1 ? 'Break-even range' : 'Below break-even'} large />
              <MetricCard label={`Avg Revenue per Customer (${period})`} value={m.totalCustomers > 0 ? m.totalRevenue / m.totalCustomers : 0} color="cyan" icon={DollarSign}
                sublabel="Shopify LTV proxy" />
              <MetricCard label="Payback Period" value={m.blendedCac > 0 && m.contributionMargin > 0 ? m.blendedCac / ((m.totalRevenue * m.contributionMargin) / (m.totalCustomers || 1) / (periodDays[period] / 30)) : 0} format="number" color="violet" icon={RefreshCw}
                sublabel={m.blendedCac > 0 ? 'Months to recover CAC' : 'N/A'} />
            </div>
          ) : (
            <div className="bg-slate-800/50 rounded-2xl border border-slate-700 p-6 text-center">
              <Users className="w-8 h-8 text-slate-600 mx-auto mb-2" />
              <p className="text-slate-400 text-sm">LTV:CAC requires customer data from Shopify</p>
              <p className="text-slate-500 text-xs mt-1">Run a Shopify sync to populate — existing daily data was saved before customer tracking was added</p>
            </div>
          )}
        </Section>

        {/* Revenue Split */}
        <Section title="Revenue Composition">
          <div className="bg-slate-800/50 rounded-2xl border border-slate-700 p-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div>
                <div className="text-xs text-slate-400 uppercase tracking-wider mb-1">New Customer Revenue</div>
                <div className="text-lg font-bold text-white">{formatCurrency(m.newCustomerRevenue)}</div>
                <div className="text-xs text-slate-500">{m.totalRevenue > 0 ? ((m.newCustomerRevenue / m.totalRevenue) * 100).toFixed(0) : 0}% of total</div>
              </div>
              <div>
                <div className="text-xs text-slate-400 uppercase tracking-wider mb-1">Returning Revenue</div>
                <div className="text-lg font-bold text-white">{formatCurrency(m.returningCustomerRevenue)}</div>
                <div className="text-xs text-slate-500">{m.totalRevenue > 0 ? ((m.returningCustomerRevenue / m.totalRevenue) * 100).toFixed(0) : 0}% of total</div>
              </div>
              <div>
                <div className="text-xs text-slate-400 uppercase tracking-wider mb-1">Amazon Revenue</div>
                <div className="text-lg font-bold text-white">{formatCurrency(m.amazonRevenue)}</div>
                <div className="text-xs text-slate-500">{m.totalRevenue > 0 ? ((m.amazonRevenue / m.totalRevenue) * 100).toFixed(0) : 0}% of total</div>
              </div>
              <div>
                <div className="text-xs text-slate-400 uppercase tracking-wider mb-1">Discounts Given</div>
                <div className="text-lg font-bold text-rose-400">{formatCurrency(m.totalDiscounts)}</div>
                <div className="text-xs text-slate-500">{m.totalRevenue > 0 ? ((m.totalDiscounts / m.totalRevenue) * 100).toFixed(1) : 0}% of revenue</div>
              </div>
            </div>
          </div>
        </Section>

        {/* Data quality footer */}
        <div className="text-xs text-slate-600 text-center mt-4 pb-8">
          {m.daysWithData} days with data in selected period · Customer data from Shopify only · Fees are estimates
        </div>
      </div>
    </div>
  );
};

export default UnitEconomicsView;
