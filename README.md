# PotatoGen — Link Generator

A responsive, static GitHub Pages website recreated from a user-provided PotatoGen screenshot.

## Deployment

1. Upload `index.html`, `assets/css/style.css`, `assets/js/app.js`, and `.nojekyll` to the **root** of your GitHub repository, keeping the `assets` subfolders.
2. Go to **Settings → Pages**.
3. Select **Deploy from a branch**, branch `main`, folder `/ (root)`, and save.
4. Visit `https://s-chenethan1.github.io/linkless/` after deployment.

## Features

- Dark, responsive PotatoGen-style interface
- Sidebar navigation: Generator, Presets, About
- Selectable jsDelivr CDN domain presets
- GitHub repository, file path, branch, and link count inputs
- URL variants generated with numbered `?v=` parameters
- Paginated results and copy buttons
- No external dependencies or build process

## Important limitations

- A screenshot cannot reveal the original application's exact link-generation algorithm. This implementation generates **numbered URL variants** of a jsDelivr GitHub CDN URL. It does not create distinct hosted files or guarantee the URLs resolve.
- The original UI advertises 100 million links. This version accepts that count but displays **100 results per page** to avoid freezing the browser.
- The selected CDN changes the domain in the generated URL; CDN mirror availability is not guaranteed.
- No affiliation with the original PotatoGen developer.
