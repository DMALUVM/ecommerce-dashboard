// Sales Tax utility functions
// Handles parsing Shopify tax reports

import { US_STATES_TAX_INFO } from './taxData';

const parseShopifyTaxReport = (csvData, stateCode) => {
  const stateInfo = US_STATES_TAX_INFO[stateCode];
  const result = {
    state: stateCode,
    stateName: stateInfo?.name || stateCode,
    periodStart: null,
    periodEnd: null,
    totalSales: 0,
    totalTaxableSales: 0,
    totalExemptSales: 0,
    totalTaxCollected: 0,
    stateTax: 0,
    countyTax: 0,
    cityTax: 0,
    specialTax: 0,
    jurisdictions: [],
    byType: { state: [], county: [], city: [], special: [] }
  };
  
  csvData.forEach(row => {
    const jurisdiction = row['Tax jurisdiction'] || '';
    const type = (row['Tax jurisdiction type'] || '').toLowerCase();
    const county = (row['Tax county'] || '').trim();
    const code = row['Tax jurisdiction code'] || '';
    const rate = parseFloat(row['Tax rate'] || 0);
    const totalSales = parseFloat(row['Total net item sales'] || 0);
    const taxableSales = parseFloat(row['Total taxable item sales'] || 0);
    const exemptSales = parseFloat(row['Total exempt and non-taxable item sales'] || 0);
    const itemTax = parseFloat(row['Total item tax amount'] || 0);
    const shippingTax = parseFloat(row['Total shipping tax amount'] || 0);
    const totalTax = itemTax + shippingTax;
    
    result.totalSales += totalSales;
    result.totalTaxableSales += taxableSales;
    result.totalExemptSales += exemptSales;
    result.totalTaxCollected += totalTax;
    
    const jurisdictionData = {
      name: jurisdiction,
      type,
      county: county.replace(' -', '').trim(),
      code,
      rate,
      totalSales,
      taxableSales,
      exemptSales,
      taxAmount: totalTax
    };
    
    result.jurisdictions.push(jurisdictionData);
    
    if (type === 'state') {
      result.stateTax += totalTax;
      result.byType.state.push(jurisdictionData);
    } else if (type === 'county') {
      result.countyTax += totalTax;
      result.byType.county.push(jurisdictionData);
    } else if (type === 'city') {
      result.cityTax += totalTax;
      result.byType.city.push(jurisdictionData);
    } else {
      result.specialTax += totalTax;
      result.byType.special.push(jurisdictionData);
    }
  });
  
  return result;
};

export { parseShopifyTaxReport };
