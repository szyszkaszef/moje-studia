// ===== Prosty zapis tekstu → ładny wygląd (jak w notatnikach) =====
// # Nagłówek   ## Podnagłówek   - lista   1. numerowana   > cytat   ---   **pogrubienie**   ==zakreślacz==   `kod`
import { esc } from './util.js';

const inline = (s) => esc(s)
  .replace(/`([^`]+)`/g, '<code>$1</code>')
  .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  .replace(/==([^=]+)==/g, '<mark>$1</mark>')
  .replace(/~~([^~]+)~~/g, '<del>$1</del>')
  .replace(/(^|[\s(])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>')
  .replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>');

export function renderMd(src) {
  let html = '', list = null, para = [];
  const flushPara = () => { if (para.length) { html += `<p>${para.map(inline).join('<br>')}</p>`; para = []; } };
  const closeList = () => { if (list) { html += `</${list}>`; list = null; } };
  const openList = (kind) => { if (list !== kind) { flushPara(); closeList(); html += `<${kind}>`; list = kind; } };

  for (const raw of src.replace(/\r/g, '').split('\n')) {
    const l = raw.trimEnd();
    let m;
    if (!l.trim()) { flushPara(); closeList(); continue; }
    if ((m = l.match(/^(#{1,3})\s+(.*)$/))) { flushPara(); closeList(); html += `<h${m[1].length}>${inline(m[2])}</h${m[1].length}>`; continue; }
    if (/^-{3,}$/.test(l.trim())) { flushPara(); closeList(); html += '<hr>'; continue; }
    if ((m = l.match(/^>\s?(.*)$/))) { flushPara(); closeList(); html += `<blockquote>${inline(m[1])}</blockquote>`; continue; }
    if ((m = l.match(/^(\s*)[-*•]\s+(.*)$/))) { openList('ul'); html += `<li style="margin-left:${m[1].length * 0.6}em">${inline(m[2])}</li>`; continue; }
    if ((m = l.match(/^(\s*)\d+[.)]\s+(.*)$/))) { openList('ol'); html += `<li style="margin-left:${m[1].length * 0.6}em">${inline(m[2])}</li>`; continue; }
    closeList(); para.push(l);
  }
  flushPara(); closeList();
  return html;
}

// Tabela z pliku CSV/TSV (do 500 wierszy)
export function csvTable(text) {
  const first = text.split('\n')[0] || '';
  const delim = first.includes('\t') ? '\t' : first.split(';').length > first.split(',').length ? ';' : ',';
  const rows = [];
  let row = [], cell = '', quoted = false;
  for (let i = 0; i < text.length && rows.length <= 500; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (ch === '"') quoted = false; else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === delim) { row.push(cell); cell = ''; }
    else if (ch === '\n') { row.push(cell.replace(/\r$/, '')); rows.push(row); row = []; cell = ''; }
    else cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  if (!rows.length) return '<p class="muted">(pusty plik)</p>';
  const [head, ...body] = rows;
  return `<div class="tbl-wrap"><table class="csv"><thead><tr>${head.map((c) => `<th>${esc(c)}</th>`).join('')}</tr></thead>
    <tbody>${body.map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
}
