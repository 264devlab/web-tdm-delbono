// Formatting Utilities for currency and dates

export function formatCurrency(amount: number): string {
  if (amount === undefined || amount === null || isNaN(amount)) return '0';
  const rounded = Math.round(amount);
  return new Intl.NumberFormat('es-AR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(rounded);
}

export function formatDate(dateStr: string): string {
  if (!dateStr) return '';
  // If it's YYYY-MM-DD
  const parts = dateStr.split('-');
  if (parts.length === 3) {
    const [year, month, day] = parts;
    // Check if the first part is a year (4 digits)
    if (year.length === 4) {
      return `${day}/${month}/${year}`;
    }
    // If it's already DD-MM-YYYY
    return `${year}/${month}/${day}`;
  }

  try {
    const date = new Date(dateStr);
    if (!isNaN(date.getTime())) {
      const day = String(date.getDate()).padStart(2, '0');
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const year = date.getFullYear();
      return `${day}/${month}/${year}`;
    }
  } catch (e) {
    // Ignore and fallback
  }
  return dateStr;
}

export function formatDateShort(dateStr: string): string {
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  if (parts.length === 3) {
    const [year, month, day] = parts;
    if (year.length === 4) {
      return `${day}/${month}/${year.substring(2)}`;
    }
    return `${year}/${month}/${day.substring(2)}`;
  }

  try {
    const date = new Date(dateStr);
    if (!isNaN(date.getTime())) {
      const day = String(date.getDate()).padStart(2, '0');
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const year = String(date.getFullYear()).substring(2);
      return `${day}/${month}/${year}`;
    }
  } catch (e) {
    // Ignore and fallback
  }
  return dateStr;
}
