# JS Link Maker

A static, responsive link generator that creates HTML anchor tags and JavaScript DOM code from a URL.

> **Status:** Initial independent implementation. This is not a verified copy of the embedded app at https://sites.google.com/view/jslinkmaker. Its interface and features can be revised when reference screenshots or requirements are available.

## Features

- Accepts `http://` and `https://` links
- Custom link text and optional new-tab behavior
- HTML and JavaScript code output
- Copy-to-clipboard buttons and live link preview
- Up to 10 recent links stored locally in the browser
- No dependencies, server, or build process

## Run locally

Open `index.html` in a browser. Some browsers restrict clipboard access for local files; in that case, select and copy the output manually.

## Deploy to GitHub Pages

1. Create a GitHub repository and upload all project files, preserving folders.
2. Open repository **Settings → Pages**.
3. Under **Build and deployment**, select **Deploy from a branch**.
4. Choose `main` and `/ (root)`, then save.
5. Wait for GitHub to provide your published website URL.

## Files

- `index.html`: page structure
- `assets/css/style.css`: styling
- `assets/js/app.js`: link generation and local history
- `.gitignore`: common ignored files

## Safety

Generated links are limited to HTTP and HTTPS URLs. User-provided link labels are safely escaped for HTML output, and previews use DOM APIs rather than HTML injection.
