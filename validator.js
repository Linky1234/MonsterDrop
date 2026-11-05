/* Checks input syntax only. Browser CORS restrictions prevent reliable remote status checks. */
window.POTATO_VALIDATE = function ({owner,repo,ref,path,count}) {
  if (!/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/.test(owner)) return 'Enter a valid GitHub username or organization.';
  if (!/^[A-Za-z0-9_.-]+$/.test(repo) || repo==='.' || repo==='..') return 'Enter a valid repository name.';
  if (!ref || /[\s?#\\]/.test(ref) || ref.startsWith('/') || ref.endsWith('/') || ref.includes('..')) return 'Enter a valid branch or tag (for example main).';
  if (!path || path.startsWith('/') || path.split('/').some(s=>!s || s==='.' || s==='..') || /[?#\\\x00-\x1f]/.test(path)) return 'Enter a valid relative file path (for example dist/app.js).';
  if (!Number.isInteger(count) || count<1 || count>5) return 'Choose between 1 and 5 links.';
  return '';
};
window.POTATO_ENCODE = function ({owner,repo,ref,path}) {
  return {owner:encodeURIComponent(owner),repo:encodeURIComponent(repo),ref:ref.split('/').map(encodeURIComponent).join('/'),path:path.split('/').map(encodeURIComponent).join('/')};
};
