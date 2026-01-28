import React from 'react';
import { X, DollarSign, Store, ShoppingBag } from 'lucide-react';
import { formatCurrency, formatPercent, formatNumber } from '../../utils/format';
import { hasDailySalesData } from '../../utils/date';
import { getShopifyAdsForDay } from '../../utils/ads';
import { withShippingSkuRow, sumSkuRows } from '../../utils/reconcile';
import { lsSet } from '../../utils/storage';

const DayDetailsModal = ({
  viewingDayDetails,
  setViewingDayDetails,
  allDaysData,
  setAllDaysData,
  getCogsCost,
  savedProductNames,
  editingDayAdSpend,
  setEditingDayAdSpend,
  dayAdSpendEdit,
  setDayAdSpendEdit,
  queueCloudSave,
  combinedData,
  setToast
}) => {
  if (!viewingDayDetails) return null;
  
  const dayData = allDaysData[viewingDayDetails];
  if (!dayData) {
    return (
      <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" onClick={() => setViewingDayDetails(null)}>
        <div className="bg-slate-800 rounded-2xl border border-slate-700 p-6 max-w-lg w-full" onClick={e => e.stopPropagation()}>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-white">
              {new Date(viewingDayDetails + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
            </h2>
            <button onClick={() => setViewingDayDetails(null)} className="text-slate-400 hover:text-white"><X className="w-5 h-5" /></button>
          </div>
          <p className="text-slate-400">No data available for this day.</p>
        </div>
      </div>
    );
  }
  
  const amazon = dayData.amazon || {};
  let shopify = dayData.shopify || {};

  // Normalize Shopify ads metrics for this day
  const shopifyAds = getShopifyAdsForDay(dayData);

  // Ensure Shopify SKU totals reconcile
  const shopifySkuWithShipping = withShippingSkuRow(shopify.skuData || [], shopify.shippingCollected || 0);
  if (shopifySkuWithShipping.length > 0) {
    const skuSums = sumSkuRows(shopifySkuWithShipping, { units: 'unitsSold', revenue: 'netSales', cogs: 'cogs', profit: 'profit' });
    shopify = { ...shopify, revenue: skuSums.revenue, units: skuSums.units, cogs: skuSums.cogs, skuData: shopifySkuWithShipping };
  }

  const total = dayData.total || {};
  const hasAmazon = dayData.amazon && (amazon.revenue > 0 || amazon.units > 0);
  const hasShopify = dayData.shopify && (shopify.revenue > 0 || shopify.units > 0);
  
  // Calculate channel share percentages
  const totalRevenue = (amazon.revenue || 0) + (shopify.revenue || 0);
  const amazonShare = totalRevenue > 0 ? ((amazon.revenue || 0) / totalRevenue) * 100 : 0;
  const shopifyShare = totalRevenue > 0 ? ((shopify.revenue || 0) / totalRevenue) * 100 : 0;
  
  // Calculate Shopify COGS from skuData if not stored
  let shopifyCogs = shopify.cogs || 0;
  if (shopifyCogs === 0 && shopify.skuData) {
    shopifyCogs = (shopify.skuData || []).reduce((sum, sku) => {
      const skuKey = sku.sku || sku.title || '';
      const unitCost = getCogsCost(skuKey) || getCogsCost(sku.title) || 0;
      return sum + (unitCost * (sku.unitsSold || sku.units || 0));
    }, 0);
  }
  
  // Calculate totals for display
  const amazonCogs = amazon.cogs || 0;
  const amazonFees = amazon.fees || 0;
  const amazonAdSpend = amazon.adSpend || 0;
  const shopifyAdSpend = (shopify.metaSpend || 0) + (shopify.googleSpend || 0) + (shopify.adSpend || 0);
  const shopifyFees = shopify.fees || shopify.transactionFees || 0;
  const shopifyShipping = shopify.shipping || 0;
  
  // Save ad spend edits
  const saveAdSpendEdit = () => {
    const metaSpend = parseFloat(dayAdSpendEdit.meta) || 0;
    const googleSpend = parseFloat(dayAdSpendEdit.google) || 0;
    
    const oldMetaSpend = shopify.metaSpend || 0;
    const oldGoogleSpend = shopify.googleSpend || 0;
    const adSpendDiff = (metaSpend + googleSpend) - (oldMetaSpend + oldGoogleSpend);
    
    const updatedShopify = {
      ...shopify,
      metaSpend,
      googleSpend,
      adSpend: metaSpend + googleSpend,
      netProfit: (shopify.netProfit || 0) - adSpendDiff,
      netMargin: shopify.revenue > 0 ? (((shopify.netProfit || 0) - adSpendDiff) / shopify.revenue) * 100 : 0,
      roas: (metaSpend + googleSpend) > 0 ? (shopify.revenue || 0) / (metaSpend + googleSpend) : 0,
    };
    
    const newTotalAdSpend = (amazon.adSpend || 0) + metaSpend + googleSpend;
    const newTotalProfit = (total.netProfit || 0) - adSpendDiff;
    const newTotalRevenue = total.revenue || 0;
    
    const updatedTotal = {
      ...total,
      adSpend: newTotalAdSpend,
      netProfit: newTotalProfit,
      netMargin: newTotalRevenue > 0 ? (newTotalProfit / newTotalRevenue) * 100 : 0,
      roas: newTotalAdSpend > 0 ? newTotalRevenue / newTotalAdSpend : 0,
    };
    
    const updatedDayData = {
      ...dayData,
      shopify: updatedShopify,
      total: updatedTotal,
      metaSpend: metaSpend,
      metaAds: metaSpend,
      googleSpend: googleSpend,
      googleAds: googleSpend,
      lastEdited: new Date().toISOString(),
    };
    
    const updatedDays = { ...allDaysData, [viewingDayDetails]: updatedDayData };
    setAllDaysData(updatedDays);
    lsSet('ecommerce_daily_sales_v1', JSON.stringify(updatedDays));
    queueCloudSave({ ...combinedData, dailySales: updatedDays });
    
    setEditingDayAdSpend(false);
    setToast({ message: 'Ad spend updated!', type: 'success' });
  };
  
  const startEditingAdSpend = () => {
    setDayAdSpendEdit({
      meta: (shopify.metaSpend || 0).toString(),
      google: (shopify.googleSpend || 0).toString(),
    });
    setEditingDayAdSpend(true);
  };
  
  return (
    <div className="fixed inset-0 bg-black/70 flex items-start justify-center z-50 p-2 sm:p-4 overflow-y-auto" onClick={() => { setViewingDayDetails(null); setEditingDayAdSpend(false); }}>
      <div className="bg-slate-800 rounded-xl sm:rounded-2xl border border-slate-700 p-4 sm:p-6 max-w-4xl w-full my-2 sm:my-4 max-h-[calc(100vh-1rem)] sm:max-h-[calc(100vh-2rem)] overflow-y-auto" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-start justify-between mb-4 sm:mb-6 gap-2">
          <div className="min-w-0 flex-1">
            <h2 className="text-base sm:text-xl font-bold text-white leading-tight">
              {new Date(viewingDayDetails + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
            </h2>
            <p className="text-slate-400 text-xs sm:text-sm">Daily Performance Details</p>
          </div>
          <button onClick={() => { setViewingDayDetails(null); setEditingDayAdSpend(false); }} className="text-slate-400 hover:text-white p-2 hover:bg-slate-700 rounded-lg flex-shrink-0"><X className="w-5 h-5" /></button>
        </div>
        
        {/* Edit Ad Spend Section */}
        {editingDayAdSpend && (
          <div className="bg-amber-900/20 border border-amber-500/30 rounded-xl p-3 sm:p-4 mb-4 sm:mb-6">
            <h3 className="text-amber-300 font-semibold mb-3 flex items-center gap-2 text-sm sm:text-base">
              <DollarSign className="w-4 h-4" /> Edit Ad Spend
            </h3>
            <div className="grid grid-cols-2 gap-3 sm:gap-4 mb-3 sm:mb-4">
              <div>
                <label className="block text-xs sm:text-sm text-slate-300 mb-1">Meta ($)</label>
                <input 
                  type="number" 
                  step="0.01"
                  id="day-ad-spend-meta"
                  defaultValue={dayAdSpendEdit.meta}
                  className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                  placeholder="0.00"
                />
              </div>
              <div>
                <label className="block text-xs sm:text-sm text-slate-300 mb-1">Google ($)</label>
                <input 
                  type="number" 
                  step="0.01"
                  id="day-ad-spend-google"
                  defaultValue={dayAdSpendEdit.google}
                  className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                  placeholder="0.00"
                />
              </div>
            </div>
            <div className="flex gap-2">
              <button 
                onClick={() => {
                  const meta = document.getElementById('day-ad-spend-meta')?.value || '0';
                  const google = document.getElementById('day-ad-spend-google')?.value || '0';
                  setDayAdSpendEdit({ meta, google });
                  setTimeout(saveAdSpendEdit, 10);
                }}
                className="px-3 sm:px-4 py-2 bg-emerald-600 hover:bg-emerald-500 rounded-lg text-white text-sm font-medium"
              >
                Save
              </button>
              <button 
                onClick={() => setEditingDayAdSpend(false)}
                className="px-3 sm:px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-white text-sm"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
        
        {/* Summary Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-4 mb-4 sm:mb-6">
          <div className="bg-slate-900/50 rounded-lg sm:rounded-xl p-3 sm:p-4">
            <p className="text-slate-400 text-[10px] sm:text-xs mb-0.5 sm:mb-1">Revenue</p>
            <p className="text-base sm:text-xl font-bold text-white">{formatCurrency(totalRevenue)}</p>
          </div>
          <div className="bg-slate-900/50 rounded-lg sm:rounded-xl p-3 sm:p-4">
            <p className="text-slate-400 text-[10px] sm:text-xs mb-0.5 sm:mb-1">Profit</p>
            {(() => {
              const totalCogs = amazonCogs + shopifyCogs;
              const totalFees = amazonFees + shopifyFees;
              const totalAds = amazonAdSpend + shopifyAdSpend;
              const calcTotalProfit = total.netProfit || (totalRevenue - totalCogs - totalFees - shopifyShipping - totalAds);
              return <p className={`text-base sm:text-xl font-bold ${calcTotalProfit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{formatCurrency(calcTotalProfit)}</p>;
            })()}
          </div>
          <div className="bg-slate-900/50 rounded-lg sm:rounded-xl p-3 sm:p-4">
            <p className="text-slate-400 text-[10px] sm:text-xs mb-0.5 sm:mb-1">Units</p>
            <p className="text-base sm:text-xl font-bold text-white">{formatNumber((amazon.units || 0) + (shopify.units || 0))}</p>
          </div>
          <div className="bg-slate-900/50 rounded-lg sm:rounded-xl p-3 sm:p-4">
            <p className="text-slate-400 text-[10px] sm:text-xs mb-0.5 sm:mb-1">Margin</p>
            {(() => {
              const totalCogs = amazonCogs + shopifyCogs;
              const totalFees = amazonFees + shopifyFees;
              const totalAds = amazonAdSpend + shopifyAdSpend;
              const calcTotalProfit = total.netProfit || (totalRevenue - totalCogs - totalFees - shopifyShipping - totalAds);
              const calcMargin = totalRevenue > 0 ? (calcTotalProfit / totalRevenue) * 100 : 0;
              return <p className={`text-base sm:text-xl font-bold ${calcMargin >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{formatPercent(calcMargin)}</p>;
            })()}
          </div>
        </div>
        
        {/* Channel Breakdown */}
        <div className="grid grid-cols-1 gap-4 sm:gap-6 mb-4 sm:mb-6">
          {/* Amazon */}
          <div className={`rounded-lg sm:rounded-xl border p-3 sm:p-4 ${hasAmazon ? 'bg-orange-900/20 border-orange-500/30' : 'bg-slate-900/30 border-slate-700'}`}>
            <h3 className="text-base sm:text-lg font-semibold text-orange-400 mb-2 sm:mb-3 flex items-center gap-2 flex-wrap">
              <Store className="w-4 h-4 sm:w-5 sm:h-5" /> Amazon
              {hasAmazon && <span className="text-[10px] sm:text-xs bg-orange-500/20 px-2 py-0.5 rounded">{formatPercent(amazonShare)}</span>}
            </h3>
            {hasAmazon ? (
              <div className="space-y-1.5 sm:space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-slate-400">Revenue</span><span className="text-white font-medium">{formatCurrency(amazon.revenue || 0)}</span></div>
                <div className="flex justify-between"><span className="text-slate-400">Units</span><span className="text-white font-medium">{formatNumber(amazon.units || 0)}</span></div>
                <div className="border-t border-orange-500/20 pt-1.5 mt-1.5">
                  <div className="flex justify-between text-slate-500"><span>COGS</span><span className="text-rose-400/70">-{formatCurrency(amazonCogs)}</span></div>
                  <div className="flex justify-between text-slate-500"><span>Amazon Fees</span><span className="text-rose-400/70">-{formatCurrency(amazonFees)}</span></div>
                  <div className="flex justify-between text-slate-500"><span>Ad Spend</span><span className="text-amber-400">-{formatCurrency(amazonAdSpend)}</span></div>
                </div>
                <div className="border-t border-orange-500/30 pt-2 mt-2">
                  <div className="flex justify-between"><span className="text-slate-300 font-medium">Net Profit</span><span className={`font-bold ${(amazon.netProfit || 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{formatCurrency(amazon.netProfit || 0)}</span></div>
                  <div className="flex justify-between"><span className="text-slate-400">Margin</span><span className={`font-medium ${(amazon.netMargin || 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{formatPercent(amazon.netMargin || (amazon.revenue > 0 ? (amazon.netProfit / amazon.revenue) * 100 : 0))}</span></div>
                  {amazonAdSpend > 0 && <div className="flex justify-between"><span className="text-slate-400">ROAS</span><span className="text-cyan-400 font-medium">{(amazon.revenue / amazonAdSpend).toFixed(2)}x</span></div>}
                </div>
              </div>
            ) : (
              <p className="text-slate-500 text-sm">No Amazon sales this day</p>
            )}
          </div>
          
          {/* Shopify */}
          <div className={`rounded-lg sm:rounded-xl border p-3 sm:p-4 ${hasShopify ? 'bg-green-900/20 border-green-500/30' : 'bg-slate-900/30 border-slate-700'}`}>
            <h3 className="text-base sm:text-lg font-semibold text-green-400 mb-2 sm:mb-3 flex items-center gap-2 flex-wrap">
              <ShoppingBag className="w-4 h-4 sm:w-5 sm:h-5" /> Shopify
              {hasShopify && <span className="text-[10px] sm:text-xs bg-green-500/20 px-2 py-0.5 rounded">{formatPercent(shopifyShare)}</span>}
            </h3>
            {hasShopify ? (
              <div className="space-y-1.5 sm:space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-slate-400">Revenue</span><span className="text-white font-medium">{formatCurrency(shopify.revenue || 0)}</span></div>
                <div className="flex justify-between"><span className="text-slate-400">Units</span><span className="text-white font-medium">{formatNumber(shopify.units || 0)}</span></div>
                <div className="border-t border-green-500/20 pt-1.5 mt-1.5">
                  {shopifyCogs > 0 && <div className="flex justify-between text-slate-500"><span>COGS</span><span className="text-rose-400/70">-{formatCurrency(shopifyCogs)}</span></div>}
                  {shopifyFees > 0 && <div className="flex justify-between text-slate-500"><span>Transaction Fees</span><span className="text-rose-400/70">-{formatCurrency(shopifyFees)}</span></div>}
                  {shopifyShipping > 0 && <div className="flex justify-between text-slate-500"><span>Shipping</span><span className="text-rose-400/70">-{formatCurrency(shopifyShipping)}</span></div>}
                  {(shopify.metaSpend || 0) > 0 && <div className="flex justify-between text-slate-500"><span>Meta Ads</span><span className="text-amber-400">-{formatCurrency(shopify.metaSpend || 0)}</span></div>}
                  {(shopify.googleSpend || 0) > 0 && <div className="flex justify-between text-slate-500"><span>Google Ads</span><span className="text-amber-400">-{formatCurrency(shopify.googleSpend || 0)}</span></div>}
                  {shopifyAdSpend === 0 && shopifyCogs === 0 && shopifyFees === 0 && shopifyShipping === 0 && (
                    <div className="text-slate-500 text-xs italic">No costs tracked yet</div>
                  )}
                </div>
                <div className="border-t border-green-500/30 pt-2 mt-2">
                  {(() => {
                    const calcProfit = shopify.netProfit || (shopify.revenue - shopifyCogs - shopifyFees - shopifyShipping - shopifyAdSpend);
                    const calcMargin = shopify.revenue > 0 ? (calcProfit / shopify.revenue) * 100 : 0;
                    return (
                      <>
                        <div className="flex justify-between"><span className="text-slate-300 font-medium">Net Profit</span><span className={`font-bold ${calcProfit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{formatCurrency(calcProfit)}</span></div>
                        <div className="flex justify-between"><span className="text-slate-400">Margin</span><span className={`font-medium ${calcMargin >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{formatPercent(calcMargin)}</span></div>
                        {shopifyAdSpend > 0 && <div className="flex justify-between"><span className="text-slate-400">ROAS</span><span className="text-cyan-400 font-medium">{(shopify.revenue / shopifyAdSpend).toFixed(2)}x</span></div>}
                      </>
                    );
                  })()}
                </div>
              </div>
            ) : (
              <p className="text-slate-500 text-sm">No Shopify sales this day</p>
            )}
          </div>
        </div>
        
        {/* Google Ads data if present */}
        {(shopifyAds.googleSpend || shopifyAds.googleImpressions || shopifyAds.googleClicks || shopifyAds.googleConversions) && (
          <div className="bg-red-900/20 border border-red-500/30 rounded-lg sm:rounded-xl p-3 sm:p-4 mb-4 sm:mb-6">
            <h3 className="text-base sm:text-lg font-semibold text-red-400 mb-2 sm:mb-3">Google Ads</h3>
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 sm:gap-4 text-center">
              <div><p className="text-slate-400 text-[10px] sm:text-xs">Spend</p><p className="text-white text-sm font-medium">{formatCurrency(shopifyAds.googleSpend || 0)}</p></div>
              <div><p className="text-slate-400 text-[10px] sm:text-xs">Clicks</p><p className="text-white text-sm font-medium">{formatNumber(shopifyAds.googleClicks || 0)}</p></div>
              <div><p className="text-slate-400 text-[10px] sm:text-xs">Impr</p><p className="text-white text-sm font-medium">{formatNumber(shopifyAds.googleImpressions || 0)}</p></div>
              <div><p className="text-slate-400 text-[10px] sm:text-xs">Conv</p><p className="text-white text-sm font-medium">{formatNumber(shopifyAds.googleConversions || 0)}</p></div>
              <div><p className="text-slate-400 text-[10px] sm:text-xs">CPC</p><p className="text-white text-sm font-medium">{formatCurrency(shopifyAds.googleCPC || 0)}</p></div>
              <div><p className="text-slate-400 text-[10px] sm:text-xs">CPA</p><p className="text-white text-sm font-medium">{formatCurrency(shopifyAds.googleCostPerConv || 0)}</p></div>
            </div>
          </div>
        )}
        
        {/* Meta Ads data if present */}
        {(shopifyAds.metaSpend || shopifyAds.metaImpressions || shopifyAds.metaClicks || shopifyAds.metaPurchases) && (
          <div className="bg-indigo-900/20 border border-indigo-500/30 rounded-lg sm:rounded-xl p-3 sm:p-4 mb-4 sm:mb-6">
            <h3 className="text-base sm:text-lg font-semibold text-indigo-400 mb-2 sm:mb-3">Meta Ads</h3>
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 sm:gap-4 text-center">
              <div><p className="text-slate-400 text-[10px] sm:text-xs">Spend</p><p className="text-white text-sm font-medium">{formatCurrency(shopifyAds.metaSpend || 0)}</p></div>
              <div><p className="text-slate-400 text-[10px] sm:text-xs">Clicks</p><p className="text-white text-sm font-medium">{formatNumber(shopifyAds.metaClicks || 0)}</p></div>
              <div><p className="text-slate-400 text-[10px] sm:text-xs">Impr</p><p className="text-white text-sm font-medium">{formatNumber(shopifyAds.metaImpressions || 0)}</p></div>
              <div><p className="text-slate-400 text-[10px] sm:text-xs">Purch</p><p className="text-white text-sm font-medium">{formatNumber(shopifyAds.metaPurchases || 0)}</p></div>
              <div><p className="text-slate-400 text-[10px] sm:text-xs">CTR</p><p className="text-white text-sm font-medium">{(shopifyAds.metaCTR || 0).toFixed(1)}%</p></div>
              <div><p className="text-slate-400 text-[10px] sm:text-xs">CPC</p><p className="text-white text-sm font-medium">{formatCurrency(shopifyAds.metaCPC || 0)}</p></div>
            </div>
          </div>
        )}
        
        {/* SKU Breakdown */}
        {((amazon.skuData && amazon.skuData.length > 0) || (shopify.skuData && shopify.skuData.length > 0)) && (
          <div className="bg-slate-900/50 rounded-lg sm:rounded-xl p-3 sm:p-4">
            <h3 className="text-base sm:text-lg font-semibold text-white mb-2 sm:mb-3">Top Products</h3>
            <div className="grid grid-cols-1 gap-3 sm:gap-4">
              {amazon.skuData && amazon.skuData.length > 0 && (
                <div>
                  <p className="text-orange-400 text-xs sm:text-sm font-medium mb-1.5 sm:mb-2">Amazon</p>
                  <div className="space-y-1 max-h-32 sm:max-h-40 overflow-y-auto">
                    {amazon.skuData.slice(0, 5).map((sku, i) => (
                      <div key={i} className="flex justify-between text-xs sm:text-sm">
                        <span className="text-slate-300 truncate flex-1 mr-2">{savedProductNames[sku.sku] || sku.name || sku.sku}</span>
                        <span className="text-white flex-shrink-0">{formatCurrency(sku.netSales || 0)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {shopify.skuData && shopify.skuData.length > 0 && (
                <div>
                  <p className="text-green-400 text-xs sm:text-sm font-medium mb-1.5 sm:mb-2">Shopify</p>
                  <div className="space-y-1 max-h-32 sm:max-h-40 overflow-y-auto">
                    {shopify.skuData.filter(s => !s?.isShipping && String(s?.sku || '').toLowerCase() !== 'shipping').slice(0, 5).map((sku, i) => (
                      <div key={i} className="flex justify-between text-xs sm:text-sm">
                        <span className="text-slate-300 truncate flex-1 mr-2">{savedProductNames[sku.sku] || sku.name || sku.sku}</span>
                        <span className="text-white flex-shrink-0">{formatCurrency(sku.netSales || 0)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
        
        {/* Footer */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mt-4 sm:mt-6 pt-3 sm:pt-4 border-t border-slate-700">
          <p className="text-slate-500 text-[10px] sm:text-xs order-2 sm:order-1">
            {dayData.createdAt && `${new Date(dayData.createdAt).toLocaleDateString()}`}
            {dayData.lastEdited && ` • Edited`}
          </p>
          <div className="flex gap-2 w-full sm:w-auto order-1 sm:order-2">
            {!editingDayAdSpend && hasDailySalesData(dayData) && (
              <button 
                onClick={startEditingAdSpend}
                className="flex-1 sm:flex-none px-3 sm:px-4 py-2 bg-amber-600/30 hover:bg-amber-600/50 border border-amber-500/50 rounded-lg text-amber-300 text-xs sm:text-sm flex items-center justify-center gap-1.5 sm:gap-2"
              >
                <DollarSign className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> <span className="hidden sm:inline">Edit </span>Ad Spend
              </button>
            )}
            <button onClick={() => { setViewingDayDetails(null); setEditingDayAdSpend(false); }} className="flex-1 sm:flex-none px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-white text-sm">Close</button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DayDetailsModal;
