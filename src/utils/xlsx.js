// Dynamically load SheetJS from CDN (avoids npm vulnerability)
let XLSX = null;
export const loadXLSX = async () => {
  if (XLSX) return XLSX;
  if (window.XLSX) { XLSX = window.XLSX; return XLSX; }
  
  const loadScript = (src, integrity = null) => new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.crossOrigin = 'anonymous';
    if (integrity) script.integrity = integrity;
    script.onload = () => { XLSX = window.XLSX; resolve(XLSX); };
    script.onerror = reject;
    document.head.appendChild(script);
  });
  
  // Try primary CDN first, fallback to secondary
  try {
    return await loadScript(
      'https://cdn.sheetjs.com/xlsx-0.20.1/package/dist/xlsx.full.min.js'
    );
  } catch {
    // Fallback to cdnjs if primary fails
    return await loadScript(
      'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js',
      'sha512-5qGFH9V9GqAH7BTKxqDBFQQj7DrHLRddBHPpHEHMDvO7L7NxBPjL7Wd7Mt981LVs9F/VGBI4RlnGJbxPzRIGlA=='
    );
  }
};
