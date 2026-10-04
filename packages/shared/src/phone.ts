// Nigerian mobile numbers. Accepts 0803..., 803..., 234803..., +234 803 ... with spaces or dashes.

/** Returns the international form without "+" (what wa.me wants), e.g. "2348031234567", or null if invalid. */
export function normalizeNigerianPhone(input: string): string | null {
  let digits = input.replace(/[\s\-().]/g, '');
  if (digits.startsWith('+')) digits = digits.slice(1);
  if (!/^\d+$/.test(digits)) return null;
  if (digits.startsWith('234')) digits = digits.slice(3);
  else if (digits.startsWith('0')) digits = digits.slice(1);
  // Mobile numbers: 10 digits after the country code, starting 7, 8 or 9.
  return /^[789]\d{9}$/.test(digits) ? `234${digits}` : null;
}

/** "2348031234567" -> "+234 803 123 4567". */
export function formatNigerianPhone(normalized: string): string {
  const m = /^234(\d{3})(\d{3})(\d{4})$/.exec(normalized);
  return m ? `+234 ${m[1]} ${m[2]} ${m[3]}` : normalized;
}

export function whatsappUrl(normalizedPhone: string, text: string): string {
  return `https://wa.me/${normalizedPhone}?text=${encodeURIComponent(text)}`;
}
