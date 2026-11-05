
"use strict";

const $ = id => document.getElementById(id);

const MAX_LINKS = 100000000;

const providers = [
  {
    id: "jsdelivr",
    name: "jsDelivr",
    description: "GitHub CDN",
    build: (o, r, b, p) =>
      `https://cdn.jsdelivr.net/gh/${o}/${r}@${b}/${p}`
  },
  {
    id: "statically",
    name: "Statically",
    description: "Alternative GitHub CDN",
    build: (o, r, b, p) =>
      `https://cdn.statically.io/gh/${o}/${r}/${b}/${p}`
  },
  {
    id: "githack",
    name: "GitHack",
    description: "Browser-friendly GitHub files",
    build: (o, r, b, p) =>
      `https://raw.githack.com/${o}/${r}/${b}/${p}`
  },
  {
    id: "raw",
    name: "GitHub Raw",
    description: "Original repository files",
    build: (o, r, b, p) =>
      `https://raw.githubusercontent.com/${o}/${r}/${b}/${p}`
  },
  {
    id: "pages",
    name: "GitHub Pages",
    description: "Published website files",
    build: (o, r, b, p) =>
      `https://${o}.github.io/${r}/${p}`
  }
];

let files = [];
let selectedProviders = [];
let repoInfo = null;
let currentPage = 0;
let pageSize = 100;
let maxLinks = MAX_LINKS;
let generationId = 0;

function showError(message) {
  $("formError").textContent = message;
  $("formError").hidden = false;
}

function clearError() {
  $("formError").textContent = "";
  $("formError").hidden = true;
}

function setStatus(message) {
  $("scanStatus").textContent = message;
}

function setView(name) {
  for (const view of ["generator", "presets", "about"]) {
    $(view + "View").hidden = view !== name;
  }

  document.querySelectorAll(".nav").forEach(button => {
    button.classList.toggle(
      "active",
      button.dataset.view === name
    );
  });
}

document.querySelectorAll(".nav").forEach(button => {
  button.addEventListener("click", () => {
    setView(button.dataset.view);
  });
});

function updateMode() {
  $("fileField").hidden = $("mode").value !== "file";
}

$("mode").addEventListener("change", updateMode);
updateMode();

function parseRepository(value) {
  let input = value.trim();

  input = input.replace(/^https?:\/\/github\.com\//i, "");
  input = input.replace(/\/+$/, "");

  const parts = input.split("/");

  if (
    parts.length !== 2 ||
    !/^[a-zA-Z0-9-]+$/.test(parts[0]) ||
    !/^[a-zA-Z0-9._-]+$/.test(parts[1])
  ) {
    throw new Error(
      "Enter username/repository or a valid GitHub URL."
    );
  }

  return {
    owner: parts[0],
    repo: parts[1]
  };
}

function encodePath(path) {
  return path
    .split("/")
    .map(part => encodeURIComponent(part))
    .join("/");
}

function validateBranch(branch) {
  if (
    !branch ||
    branch.startsWith("/") ||
    branch.endsWith("/") ||
    branch.includes("..") ||
    branch.includes("\\") ||
    /[\s~^:?*[\]]/.test(branch)
  ) {
    throw new Error("Enter a valid Git branch.");
  }
}

async function scanRepository(owner, repo, branch) {
  const api = `https://api.github.com/repos/` +
    `${encodeURIComponent(owner)}/` +
    `${encodeURIComponent(repo)}/git/trees/` +
    `${encodeURIComponent(branch)}?recursive=1`;

  const response = await fetch(api, {
    headers: {
      Accept: "application/vnd.github+json"
    }
  });

  if (!response.ok) {
    if (response.status === 403) {
      throw new Error(
        "GitHub API rate limit reached or access denied."
      );
    }

    if (response.status === 404) {
      throw new Error(
        "Repository or branch not found. " +
        "Make sure it is public."
      );
    }

    throw new Error(
      `GitHub API returned ${response.status}.`
    );
  }

  const data = await response.json();

  if (data.truncated) {
    throw new Error(
      "GitHub returned an incomplete file tree. " +
      "This repository is too large for this scanning method."
    );
  }

  if (!Array.isArray(data.tree)) {
    throw new Error("Invalid repository tree response.");
  }

  return data.tree
    .filter(item => item.type === "blob")
    .map(item => item.path);
}

function getProviders(choice) {
  if (choice === "all") return providers;

  return providers.filter(p => p.id === choice);
}

function totalLinks() {
  return Math.min(
    maxLinks,
    files.length * selectedProviders.length
  );
}

function getLinkAt(index) {
  const providerCount = selectedProviders.length;

  const fileIndex = Math.floor(index / providerCount);
  const providerIndex = index % providerCount;

  const file = files[fileIndex];
  const provider = selectedProviders[providerIndex];

  const owner = encodeURIComponent(repoInfo.owner);
  const repo = encodeURIComponent(repoInfo.repo);
  const branch = encodeURIComponent(repoInfo.branch);
  const path = encodePath(file);

  return {
    file,
    provider: provider.name,
    url: provider.build(owner, repo, branch, path)
  };
}

function renderPage() {
  const total = totalLinks();
  const totalPages = Math.ceil(total / pageSize);

  if (total === 0) {
    $("results").hidden = true;
    return;
  }

  currentPage = Math.min(
    currentPage,
    Math.max(0, totalPages - 1)
  );

  const start = currentPage * pageSize;
  const end = Math.min(start + pageSize, total);

  $("results").hidden = false;

  $("resultsSummary").textContent =
    `${total.toLocaleString()} candidate links · ` +
    `${files.length.toLocaleString()} files`;

  $("pageLabel").textContent =
    `Page ${(currentPage + 1).toLocaleString()} ` +
    `of ${totalPages.toLocaleString()}`;

  $("prev").disabled = currentPage === 0;
  $("next").disabled = currentPage >= totalPages - 1;

  const fragment = document.createDocumentFragment();

  for (let i = start; i < end; i++) {
    const item = getLinkAt(i);

    const row = document.createElement("div");
    row.className = "link-item";

    const info = document.createElement("div");
    info.className = "link-info";

    const meta = document.createElement("small");
    meta.textContent = `${item.provider} · ${item.file}`;

    const anchor = document.createElement("a");
    anchor.href = item.url;
    anchor.target = "_blank";
    anchor.rel = "noopener noreferrer";
    anchor.textContent = item.url;

    const copyButton = document.createElement("button");
    copyButton.type = "button";
    copyButton.textContent = "Copy";

    copyButton.addEventListener("click", () => {
      copyText(item.url, copyButton);
    });

    info.append(meta, anchor);
    row.append(info, copyButton);
    fragment.append(row);
  }

  $("linkList").replaceChildren(fragment);
}

async function copyText(text, button) {
  const original = button.textContent;

  try {
    await navigator.clipboard.writeText(text);
    button.textContent = "Copied!";
  } catch {
    button.textContent = "Copy failed";
  }

  setTimeout(() => {
    button.textContent = original;
  }, 1500);
}

$("generatorForm").addEventListener("submit", async event => {
  event.preventDefault();

  const requestId = ++generationId;

  clearError();
  setStatus("Preparing...");
  $("results").hidden = true;

  const button = $("generate");
  button.disabled = true;
  button.textContent = "Scanning...";

  try {
    const parsed = parseRepository($("repo").value);
    const branch = $("branch").value.trim();

    validateBranch(branch);

    const choice = $("provider").value;
    const mode = $("mode").value;

    const requestedLimit = Number($("limit").value);

    if (
      !Number.isSafeInteger(requestedLimit) ||
      requestedLimit < 1 ||
      requestedLimit > MAX_LINKS
    ) {
      throw new Error(
        "Maximum links must be between 1 and 100,000,000."
      );
    }

    maxLinks = requestedLimit;
    pageSize = Number($("pageSize").value);

    if (mode === "repository") {
      setStatus("Retrieving repository files...");

      files = await scanRepository(
        parsed.owner,
        parsed.repo,
        branch
      );
    } else {
      const path = $("file").value.trim()
        .replace(/^\/+/, "");

      if (
        !path ||
        path.includes("..") ||
        path.includes("\\") ||
        path.endsWith("/")
      ) {
        throw new Error("Enter a valid file path.");
      }

      files = [path];
    }

    if (requestId !== generationId) return;

    if (files.length === 0) {
      throw new Error("No files found.");
    }

    selectedProviders = getProviders(choice);

    if (!selectedProviders.length) {
      throw new Error("No valid CDN provider selected.");
    }

    repoInfo = {
      ...parsed,
      branch
    };

    currentPage = 0;
    renderPage();

    setStatus(
      `Found ${files.length.toLocaleString()} files. ` +
      `Generated ${totalLinks().toLocaleString()} ` +
      `candidate URLs.`
    );

  } catch (error) {
    if (requestId === generationId) {
      showError(error.message);
      setStatus("");
    }
  } finally {
    if (requestId === generationId) {
      button.disabled = false;
      button.textContent = "⚡ Generate Links";
    }
  }
});

$("prev").addEventListener("click", () => {
  if (currentPage > 0) {
    currentPage--;
    renderPage();
  }
});

$("next").addEventListener("click", () => {
  const totalPages = Math.ceil(totalLinks() / pageSize);

  if (currentPage + 1 < totalPages) {
    currentPage++;
    renderPage();
  }
});

$("copyPage").addEventListener("click", () => {
  const start = currentPage * pageSize;
  const end = Math.min(start + pageSize, totalLinks());

  const urls = [];

  for (let i = start; i < end; i++) {
    urls.push(getLinkAt(i).url);
  }

  copyText(urls.join("\n"), $("copyPage"));
});

$("clear").addEventListener("click", () => {
  generationId++;

  $("generatorForm").reset();

  files = [];
  selectedProviders = [];
  repoInfo = null;
  currentPage = 0;

  $("results").hidden = true;
  $("linkList").replaceChildren();

  $("generate").disabled = false;
  $("generate").textContent = "⚡ Generate Links";

  clearError();
  setStatus("");
  updateMode();
});

function renderPresets() {
  const container = $("presetCards");

  const fragment = document.createDocumentFragment();

  providers.forEach(provider => {
    const button = document.createElement("button");
    button.className = "preset-card";
    button.type = "button";

    const name = document.createElement("strong");
    name.textContent = provider.name;

    const description = document.createElement("span");
    description.textContent = provider.description;

    button.append(name, description);

    button.addEventListener("click", () => {
      $("provider").value = provider.id;
      setView("generator");
    });

    fragment.append(button);
  });

  container.replaceChildren(fragment);
}

renderPresets();
