export const parseCSV = (text) => {
  // Normalize line endings (CRLF → LF) and remove BOM
  const normalized = text.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = normalized.split('\n').filter(line => line.trim());
  if (lines.length === 0) return [];
  const headers = parseCSVLine(lines[0]);
  return lines.slice(1).map(line => {
    const values = parseCSVLine(line);
    const obj = {};
    headers.forEach((header, i) => { obj[header.trim()] = values[i]?.trim() || ''; });
    return obj;
  });
};

export const parseCSVLine = (line) => {
  const result = []; 
  let current = '', inQuotes = false, i = 0;
  while (i < line.length) {
    const char = line[i];
    if (inQuotes) {
      if (char === '"') {
        // Check for escaped quote ("")
        if (line[i + 1] === '"') {
          current += '"';
          i += 2;
          continue;
        } else {
          inQuotes = false;
        }
      } else {
        current += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === ',') {
        result.push(current);
        current = '';
      } else {
        current += char;
      }
    }
    i++;
  }
  result.push(current);
  return result;
};
