/* CDN URL templates. This file must load before app.js. */
window.POTATO_PROVIDERS = Object.freeze([
  {id:'jsdelivr', name:'jsDelivr', build:({owner,repo,ref,path})=>`https://cdn.jsdelivr.net/gh/${owner}/${repo}@${ref}/${path}`},
  {id:'statically', name:'Statically', build:({owner,repo,ref,path})=>`https://cdn.statically.io/gh/${owner}/${repo}/${ref}/${path}`},
  {id:'githack', name:'GitHack CDN', build:({owner,repo,ref,path})=>`https://rawcdn.githack.com/${owner}/${repo}/${ref}/${path}`},
  {id:'raw', name:'GitHub Raw', build:({owner,repo,ref,path})=>`https://raw.githubusercontent.com/${owner}/${repo}/${ref}/${path}`},
  {id:'pages', name:'GitHub Pages', build:({owner,repo,path})=>`https://${owner.toLowerCase()}.github.io/${repo.toLowerCase()===(owner.toLowerCase()+'.github.io')?'':repo+'/'}${path}`}
]);
