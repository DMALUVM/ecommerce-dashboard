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


// Calculate next due date based on filing frequency
const getNextDueDate = (frequency, stateCode) => {
  const now = new Date();
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();
  const currentDay = now.getDate();
  
  // Most states have 20th of month due dates, some vary
  const dueDayOfMonth = 20;
  
  if (frequency === 'monthly') {
    // Due 20th of following month
    let dueMonth = currentMonth + 1;
    let dueYear = currentYear;
    if (dueMonth > 11) { dueMonth = 0; dueYear++; }
    const dueDate = new Date(dueYear, dueMonth, dueDayOfMonth);
    if (dueDate <= now) {
      dueMonth++;
      if (dueMonth > 11) { dueMonth = 0; dueYear++; }
      return new Date(dueYear, dueMonth, dueDayOfMonth);
    }
    return dueDate;
  } else if (frequency === 'quarterly') {
    // Q1 (Jan-Mar) due Apr 20, Q2 (Apr-Jun) due Jul 20, Q3 (Jul-Sep) due Oct 20, Q4 (Oct-Dec) due Jan 20
    const quarterEnds = [[3, 20], [6, 20], [9, 20], [0, 20]]; // [month, day]
    const quarterYears = [0, 0, 0, 1]; // year offset
    for (let i = 0; i < 4; i++) {
      const [m, d] = quarterEnds[i];
      const y = currentYear + quarterYears[i];
      const dueDate = new Date(y, m, d);
      if (dueDate > now) return dueDate;
    }
    return new Date(currentYear + 1, 3, 20);
  } else if (frequency === 'semi-annual') {
    // Jan-Jun due Jul 20, Jul-Dec due Jan 20
    const h1Due = new Date(currentYear, 6, 20); // Jul 20
    const h2Due = new Date(currentYear + 1, 0, 20); // Jan 20 next year
    if (h1Due > now) return h1Due;
    if (h2Due > now) return h2Due;
    return new Date(currentYear + 1, 6, 20);
  } else if (frequency === 'annual') {
    // Due Jan 20 of following year
    const dueDate = new Date(currentYear + 1, 0, 20);
    if (dueDate <= now) return new Date(currentYear + 2, 0, 20);
    return dueDate;
  }
  return new Date(currentYear, currentMonth + 1, 20);
};

export { parseShopifyTaxReport, getNextDueDate };
