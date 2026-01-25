export const formatCurrency = (num) => {
  if (num === null || num === undefined || isNaN(num)) return '$0.00';
  return (num < 0 ? '-' : '') + '$' + Math.abs(num).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};
export const formatPercent = (num) => (num === null || num === undefined || isNaN(num)) ? '0.0%' : num.toFixed(1) + '%';
export const formatNumber = (num) => (num === null || num === undefined || isNaN(num)) ? '0' : Math.round(num).toLocaleString('en-US');
