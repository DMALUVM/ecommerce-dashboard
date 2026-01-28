// Date helper functions for charts and time series

export const toDateKey = (dt) => {
  const d = dt instanceof Date ? dt : new Date(dt);
  return d.toISOString().slice(0, 10);
};

export const addDays = (key, delta) => {
  const d = new Date(key + 'T12:00:00');
  d.setDate(d.getDate() + delta);
  return toDateKey(d);
};

export const monthRange = (year, monthIdx) => {
  const start = new Date(year, monthIdx, 1, 12, 0, 0);
  const end = new Date(year, monthIdx + 1, 0, 12, 0, 0);
  return { startKey: toDateKey(start), endKey: toDateKey(end), daysInMonth: end.getDate() };
};

export const weekEndSunday = (key) => {
  const d = new Date(key + 'T12:00:00');
  const day = d.getDay();
  const diff = day === 0 ? 0 : 7 - day;
  d.setDate(d.getDate() + diff);
  return toDateKey(d);
};

export const weekStartFromEnd = (endKey) => addDays(endKey, -6);

export const fmtDay = (key, includeYear = false) =>
  new Date(key + 'T12:00:00').toLocaleDateString('en-US', { 
    month: 'short', 
    day: 'numeric', 
    ...(includeYear && { year: '2-digit' }) 
  });

export const fmtMonth = (year, monthIdx) =>
  new Date(year, monthIdx, 1, 12, 0, 0).toLocaleDateString('en-US', { month: 'short', year: '2-digit' });

export const fmtQuarter = (year, q) => `Q${q} '${String(year).slice(-2)}`;
