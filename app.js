'use strict';
const $ = (id) => document.getElementById(id);
const HISTORY_KEY = 'js-link-maker-history-v1';
function safeUrl(input) {
  try {
    const url = new URL(input.trim());
    if (!['http:', 'https:'].includes(url.protocol)) return null;
    return url.href;
  } catch { return null; }
}
function escapeHtml(text) {
  return text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
}
function readHistory() {
  try { const items = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]'); return Array.isArray(items) ? items.filter(x => x && typeof x.url === 'string' && typeof x.label === 'string').slice(0, 10) : []; }
  catch { return []; }
}
function renderHistory() {
  const list = $('history'); list.replaceChildren();
  const items = readHistory();
  if (!items.length) { const li = document.createElement('li'); li.textContent = 'No links generated yet.'; list.append(li); return; }
  for (const item of items) {
    const valid = safeUrl(item.url); if (!valid) continue;
    const li = document.createElement('li');
    const a = document.createElement('a'); a.href = valid; a.textContent = item.label || valid; a.target = '_blank'; a.rel = 'noopener noreferrer';
    const small = document.createElement('small'); small.textContent = valid;
    li.append(a, small); list.append(li);
  }
}
$('link-form').addEventListener('submit', (event) => {
  event.preventDefault(); $('error').textContent = ''; $('copy-status').textContent = '';
  const url = safeUrl($('url').value);
  if (!url) { $('error').textContent = 'Enter a valid http:// or https:// URL.'; $('results').classList.add('hidden'); return; }
  const label = $('label').value.trim() || 'Visit website';
  const newTab = $('new-tab').checked;
  const attributes = newTab ? ' target="_blank" rel="noopener noreferrer"' : '';
  $('html-output').value = `<a href="${escapeHtml(url)}"${attributes}>${escapeHtml(label)}</a>`;
  const jsUrl = JSON.stringify(url); const jsLabel = JSON.stringify(label);
  $('js-output').value = `const link = document.createElement('a');\nlink.href = ${jsUrl};\nlink.textContent = ${jsLabel};${newTab ? "\nlink.target = '_blank';\nlink.rel = 'noopener noreferrer';" : ''}\ndocument.body.appendChild(link);`;
  const a = document.createElement('a'); a.href = url; a.textContent = label;
  if (newTab) { a.target = '_blank'; a.rel = 'noopener noreferrer'; }
  $('preview').replaceChildren(a); $('results').classList.remove('hidden');
  try { const items = readHistory().filter(x => x.url !== url); items.unshift({url, label}); localStorage.setItem(HISTORY_KEY, JSON.stringify(items.slice(0, 10))); } catch { /* Storage may be unavailable */ }
  renderHistory();
});
document.querySelectorAll('[data-copy]').forEach(button => button.addEventListener('click', async () => {
  const field = $(button.dataset.copy);
  try { await navigator.clipboard.writeText(field.value); $('copy-status').textContent = 'Copied to clipboard.'; }
  catch { field.focus(); field.select(); $('copy-status').textContent = 'Select the code above and copy it manually.'; }
}));
$('clear-history').addEventListener('click', () => { try { localStorage.removeItem(HISTORY_KEY); } catch {} renderHistory(); });
renderHistory();
