/** Bounded spoiler checks, not a mathematical correctness verifier. Source
 * numbers/formulas are allowed; newly computed answers belong in the solution. */
export function discoveryAnswerLeak(text: string, source: string): boolean {
  const normalized = (s: string) => s.normalize("NFC").toLowerCase()
    .replace(/\\(?:left|right|mathrm|text)\b|[{}$\\()\[\]\s]/g, "")
    .replace(/³|\^3/g, "3");
  const origin = normalized(source);
  const value = text.normalize("NFC");
  for (const match of value.matchAll(/\d+(?:[.,]\d+)?\s*(?:m|cm|mm|dm)\s*(?:³|\^\{?3\}?)/gi))
    if (!origin.includes(normalized(match[0]))) return true;
  for (const match of normalized(value).matchAll(/\d+(?:[.,]\d+)?(?:mm|cm|dm|m)3/g))
    if (!origin.includes(match[0])) return true;
  return /(?:đáp\s*án|kết\s*quả\s*(?:cuối\s*cùng)?|vậy\s*thể\s*tích)\s*(?:đúng\s*)?(?:là|bằng|:|=)\s*(?:\\[([])?\s*(?:[A-D](?:\b|[.)])|[-+]?\d)/iu.test(value) ||
    [...value.matchAll(/\bV\s*=\s*\d+(?:[.,]\d+)?(?![\d.,a-zA-Z*+/^])/g)].some(m => !origin.includes(normalized(m[0])));
}
