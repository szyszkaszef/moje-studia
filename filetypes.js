// ===== Rozpoznawanie typów plików =====
const ext = (b, re) => re.test(b.name);

export const fmtSize = (n) => (n < 1024 ? `${n} B` : n < 1048576 ? `${Math.round(n / 1024)} KB` : `${(n / 1048576).toFixed(1)} MB`);
export const isPdf = (b) => b.mime === 'application/pdf' || ext(b, /\.pdf$/i);
export const isCsv = (b) => ext(b, /\.(csv|tsv)$/i);
export const isMd = (b) => ext(b, /\.(md|markdown)$/i);
export const isText = (b) => b.mime.startsWith('text/') || ext(b, /\.(txt|md|markdown|csv|tsv|json|log|tex|py|c|cpp|h|java|js|html|css|xml|ya?ml|m|ini|sql)$/i);

export function iconOf(b) {
  if (isPdf(b)) return '📕';
  if (isText(b)) return '📄';
  if (ext(b, /\.(docx?|odt|rtf)$/i)) return '📘';
  if (ext(b, /\.(xlsx?|ods)$/i)) return '📗';
  if (ext(b, /\.(pptx?|odp)$/i)) return '📙';
  if (ext(b, /\.(zip|rar|7z)$/i)) return '🗜️';
  return '📎';
}
