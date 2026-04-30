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

  const periodDays = { '7d': 7, '14d': 14, '30d': 30, '90d': 90 };

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
      let totalOrders = 0, shopifyOrders = 0;
      let newCustomers = 0, returningCustomers = 0;
      let newCustomerRevenue = 0, returningCustomerRevenue = 0;
      let amazonAdSpend = 0, metaAdSpend = 0, googleAdSpend = 0;
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
        totalOrders += (shopDay.orders || 0) + (amzDay.orders || amzDay.units || 0);

        newCustomers += shopDay.newCustomers || 0;
        returningCustomers += shopDay.returningCustomers || 0;
        newCustomerRevenue += shopDay.newCustomerRevenue || 0;
        returningCustomerRevenue += shopDay.returningCustomerRevenue || 0;

        amazonAdSpend += amzDay.adSpend || 0;

        totalDiscounts += shopDay.discounts || 0;
        totalShipping += shopDay.shippingCollected || 0;

        // Estimate COGS from SKU data
        const allSkus = [...(shopDay.skuData || []), ...(amzDay.skuData || [])];
        for (const sku of allSkus) {
          const skuId = sku.sku || sku.SKU || '';
          const cogsEntry = savedCogs[skuId] || savedCogs[skuId.toUpperCase()] || savedCogs[skuId.toLowerCase()];
          if (cogsEntry) {
            const units = sku.units || sku.quantity || 1;
            totalCogs += (parseFloat(cogsEntry.cost) || 0) * units;
          }
        }
      }

      // Pull meta/google spend from weekly data (manual uploads)
      const weekKeys = Object.keys(allWeeksData || {}).sort();
      for (const wk of weekKeys) {
        const wkEnd = new Date(wk + 'T12:00:00');
        const wkStart = new Date(wkEnd);
        wkStart.setDate(wkStart.getDate() - 6);
        const rangeStart = new Date(dates[dates.length - 1]);
        const rangeEnd = new Date(dates[0]);
        if (wkEnd >= rangeStart && wkStart <= rangeEnd) {
          const wkData = allWeeksData[wk];
          metaAdSpend += parseFloat(wkData?.metaAdSpend || wkData?.shopify?.metaAdSpend || 0);
          googleAdSpend += parseFloat(wkData?.googleAdSpend || wkData?.shopify?.googleAdSpend || 0);
        }
      }

      const totalAdSpend = amazonAdSpend + metaAdSpend + googleAdSpend;
      const totalCustomers = newCustomers + returningCustomers;
      const estFees = shopifyRevenue * 0.026 + amazonRevenue * 0.15;
      const contributionProfit = totalRevenue - totalCogs - estFees - totalAdSpend;
      const contributionMargin = totalRevenue > 0 ? contributionProfit / totalRevenue : 0;

      return {
        totalRevenue, shopifyRevenue, amazonRevenue,
        totalOrders, shopifyOrders,
        newCustomers, returningCustomers, totalCustomers,
        newCustomerRevenue, returningCustomerRevenue,
        amazonAdSpend, metaAdSpend, googleAdSpend, totalAdSpend,
        totalCogs, totalDiscounts, totalShipping, estFees,
        contributionProfit, contributionMargin,
        daysWithData,
        mer: totalAdSpend > 0 ? totalRevenue / totalAdSpend : 0,
        blendedCac: newCustomers > 0 ? totalAdSpend / newCustomers : 0,
        aov: totalOrders > 0 ? totalRevenue / totalOrders : 0,
        aovNew: newCustomers > 0 ? newCustomerRevenue / newCustomers : 0,
        aovReturning: returningCustomers > 0 ? returningCustomerRevenue / returningCustomers : 0,
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
            <span className="text-sm text-blue-300">No customer data yet — run a Shopify sync to populate new vs. returning customer metrics.</span>
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
        <Section title="Order Economics" info="AOV split by new vs returning reveals if your bundle/upsell strategy works. Returning AOV should be higher than new.">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <MetricCard label="AOV (Blended)" value={m.aov} prior={p.aov} color="emerald" icon={ShoppingCart} />
            <MetricCard label="AOV (New)" value={m.aovNew} prior={p.aovNew} color="cyan" icon={ShoppingCart} />
            <MetricCard label="AOV (Returning)" value={m.aovReturning} prior={p.aovReturning} color="violet" icon={ShoppingCart} />
            <MetricCard label="Total Orders" value={m.totalOrders} format="number" prior={p.totalOrders} color="slate" icon={ShoppingCart} />
          </div>
        </Section>

        {/* Contribution Margin & Unit Economics */}
        <Section title="Contribution Margin" info="Revenue minus COGS, estimated fees (Shopify 2.6%, Amazon 15%), and ad spend. This is what's left to pay for overhead and profit.">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <MetricCard label="Contribution Profit" value={m.contributionProfit} prior={p.contributionProfit} color="emerald" icon={DollarSign} large />
            <MetricCard label="Contribution Margin" value={m.contributionMargin * 100} format="percent" prior={p.contributionMargin * 100} color="cyan" />
            <MetricCard label="COGS" value={m.totalCogs} prior={p.totalCogs} color="rose" icon={DollarSign}
              sublabel={hasCogs ? `${(m.totalRevenue > 0 ? (m.totalCogs / m.totalRevenue * 100).toFixed(0) : 0)}% of revenue` : 'Not configured'} />
            <MetricCard label="Est. Fees" value={m.estFees} prior={p.estFees} color="amber" icon={DollarSign}
              sublabel="Shopify 2.6% + AMZ 15%" />
          </div>
        </Section>

        {/* LTV & Payback */}
        <Section title="LTV & Payback" info="LTV:CAC should be ≥3.0 for a healthy business. These are approximate — true LTV requires cohort analysis over 6+ months of data.">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <MetricCard label="LTV:CAC Ratio" value={m.ltvCacRatio} format="ratio" color={m.ltvCacRatio >= 3 ? 'emerald' : m.ltvCacRatio >= 1 ? 'amber' : 'rose'} icon={Target}
              sublabel={m.ltvCacRatio >= 3 ? 'Healthy' : m.ltvCacRatio >= 1 ? 'Break-even range' : 'Below break-even'} large />
            <MetricCard label={`Avg Revenue per Customer (${period})`} value={m.totalCustomers > 0 ? m.totalRevenue / m.totalCustomers : 0} color="cyan" icon={DollarSign}
              sublabel="Approximate LTV proxy" />
            <MetricCard label="Payback Period" value={m.blendedCac > 0 && m.contributionMargin > 0 ? m.blendedCac / ((m.totalRevenue * m.contributionMargin) / (m.totalCustomers || 1) / (periodDays[period] / 30)) : 0} format="number" color="violet" icon={RefreshCw}
              sublabel={m.blendedCac > 0 ? 'Months to recover CAC' : 'N/A'} />
          </div>
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
