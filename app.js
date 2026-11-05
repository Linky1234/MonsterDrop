
"use strict";

const $ = id => document.getElementById(id);
const MAX_LINKS = 100000000;

const providerNames = [
  "cdn.jsdelivr.net",
  "fastly.jsdelivr.net",
  "gcore.jsdelivr.net",
  "quantil.jsdelivr.net",
  "jsdelivr.b-cdn.net",
  "originfastly.jsdelivr.net",
  "testingcf.jsdelivr.net",
  "rawcdn.jsdelivr.net",
  "unpkg.com",
  "esm.sh",
  "cdn.staticdelivr.com",
  "raw.githack.com",
  "raw.githubusercontent.com"
];

const specialNames = [
  "Amazon S3",
  "Surge-style",
  "Raw GitHub",
  "HTML embed"
];

const defaults = new Set([
  "cdn.jsdelivr.net",
  "unpkg.com",
  "esm.sh"
]);

let files = [];
let activeProviders = [];
let repoInfo = null;
let currentPage = 0;
let pageSize = 100;
let maxLinks = MAX_LINKS;
let generationId = 0;
let options = {};

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

function createOption(name, special = false) {
  const label = document.createElement("label");
  label.className = "provider-option";

  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.value = name;
  checkbox.dataset.special = String(special);
  checkbox.checked = defaults.has(name);

  const text = document.createElement("span");
  text.textContent = name;

  function update() {
    label.classList.toggle("selected", checkbox.checked);
    updateExtras();
  }

  checkbox.addEventListener("change", update);

  label.append(checkbox, text);
  label.classList.toggle("selected", checkbox.checked);

  return label;
}

function renderOptions() {
  $("providerGrid").replaceChildren(
    ...providerNames.map(name => createOption(name))
  );

  $("specialGrid").replaceChildren(
    ...specialNames.map(name => createOption(name, true))
  );

  updateExtras();
}

function selectedNames() {
  return Array.from(
    document.querySelectorAll(
      '#providerGrid input:checked, #specialGrid input:checked'
    )
  ).map(input => input.value);
}

function updateExtras() {
  const selected = selectedNames();

  const npm = selected.includes("unpkg.com") ||
    selected.includes("esm.sh");
  const s3 = selected.includes("Amazon S3");
  const surge = selected.includes("Surge-style");

  $("npmField").hidden = !npm;
  $("s3Field").hidden = !s3;
  $("surgeField").hidden = !surge;
  $("extraFields").hidden = !(npm || s3 || surge);
}

function setProviderSelection(checked) {
  document.querySelectorAll(
    '#providerGrid input'
  ).forEach(input => {
    input.checked = checked;
    input.closest(".provider-option")
      .classList.toggle("selected", checked);
  });

  updateExtras();
}

$("selectAll").addEventListener("click", () => {
  setProviderSelection(true);
});

$("clearProviders").addEventListener("click", () => {
  setProviderSelection(false);
});

function parseRepository(value) {
  let input = value.trim();

  input = input.replace(
    /^https?:\/\/github\.com\//i,
    ""
  );

  input = input.replace(/\/+$/, "");

  const parts = input.split("/");

  if (
    parts.length !== 2 ||
    !/^[a-zA-Z0-9-]+$/.test(parts[0]) ||
    !/^[a-zA-Z0-9._-]+$/.test(parts[1])
  ) {
    throw new Error(
      "Enter a valid GitHub repository URL or owner/repo."
    );
  }

  return {
    owner: parts[0],
    repo: parts[1]
  };
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

function encodePath(path) {
  return path.split("/")
    .map(part => encodeURIComponent(part))
    .join("/");
}

async function scanRepository(owner, repo, branch) {
  const api =
    `https://api.github.com/repos/` +
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
        "Public repository or branch not found."
      );
    }

    throw new Error(
      `GitHub API returned ${response.status}.`
    );
  }

  const data = await response.json();

  if (data.truncated) {
    throw new Error(
      "GitHub returned an incomplete repository tree."
    );
  }

  if (!Array.isArray(data.tree)) {
    throw new Error("Invalid GitHub API response.");
  }

  return data.tree
    .filter(item => item.type === "blob")
    .map(item => item.path);
}

function validateNpmPackage(value) {
  if (!value) return "";

  // Supports package@version and @scope/package@version.
  if (
    !/^(?:@[a-z0-9._-]+\/)?[a-z0-9._-]+(?:@[a-zA-Z0-9._+-]+)?$/i
      .test(value)
  ) {
    throw new Error(
      "Enter a valid npm package, such as react@18.2.0."
    );
  }

  return value;
}

function validateDomain(value) {
  const domain = value.trim().toLowerCase();

  if (
    !/^(?:[a-z0-9-]+\.)+[a-z]{2,}$/i.test(domain)
  ) {
    throw new Error("Enter a valid Surge domain.");
  }

  return domain;
}

function validateBucket(value) {
  const bucket = value.trim();

  if (
    !/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(bucket)
  ) {
    throw new Error("Enter a valid S3 bucket name.");
  }

  return bucket;
}

function buildLink(provider, file) {
  const owner = encodeURIComponent(repoInfo.owner);
  const repo = encodeURIComponent(repoInfo.repo);
  const branch = encodeURIComponent(repoInfo.branch);
  const path = encodePath(file);

  const ghPath = `${owner}/${repo}@${branch}/${path}`;
  const rawPath = `${owner}/${repo}/${branch}/${path}`;

  if (provider.endsWith(".jsdelivr.net") ||
      provider === "jsdelivr.b-cdn.net") {
    return `https://${provider}/gh/${ghPath}`;
  }

  if (provider === "cdn.staticdelivr.com") {
    return `https://cdn.staticdelivr.com/gh/${ghPath}`;
  }

  if (provider === "raw.githack.com") {
    return `https://raw.githack.com/${rawPath}`;
  }

  if (
    provider === "raw.githubusercontent.com" ||
    provider === "Raw GitHub"
  ) {
    return `https://raw.githubusercontent.com/${rawPath}`;
  }

  if (provider === "unpkg.com") {
    return `https://unpkg.com/${options.npm}/${path}`;
  }

  if (provider === "esm.sh") {
    return `https://esm.sh/${options.npm}/${path}`;
  }

  if (provider === "Amazon S3") {
    return `https://${options.s3}.s3.amazonaws.com/${path}`;
  }

  if (provider === "Surge-style") {
    return `https://${options.surge}/${path}`;
  }

  if (provider === "HTML embed") {
    const raw =
      `https://raw.githack.com/${rawPath}`;

    const safe = raw.replaceAll("&", "&amp;")
      .replaceAll('"', "&quot;")
      .replaceAll("<", "&lt;");

    return `<iframe src="${safe}" ` +
      `title="Embedded file" ` +
      `loading="lazy"></iframe>`;
  }

  throw new Error(`Unknown provider: ${provider}`);
}

function totalLinks() {
  return Math.min(
    maxLinks,
    files.length * activeProviders.length
  );
}

function getLinkAt(index) {
  const providerCount = activeProviders.length;

  const fileIndex = Math.floor(index / providerCount);
  const providerIndex = index % providerCount;

  const file = files[fileIndex];
  const provider = activeProviders[providerIndex];

  return {
    file,
    provider,
    url: buildLink(provider, file)
  };
}

function renderPage() {
  const total = totalLinks();

  if (!total) {
    $("results").hidden = true;
    return;
  }

  const pages = Math.ceil(total / pageSize);
  currentPage = Math.min(currentPage, pages - 1);

  const start = currentPage * pageSize;
  const end = Math.min(start + pageSize, total);

  $("results").hidden = false;

  $("resultsSummary").textContent =
    `${total.toLocaleString()} candidate links · ` +
    `${files.length.toLocaleString()} files`;

  $("pageLabel").textContent =
    `Page ${(currentPage + 1).toLocaleString()} ` +
    `of ${pages.toLocaleString()}`;

  $("prev").disabled = currentPage === 0;
  $("next").disabled = currentPage >= pages - 1;

  const fragment = document.createDocumentFragment();

  for (let i = start; i < end; i++) {
    const item = getLinkAt(i);

    const row = document.createElement("div");
    row.className = "link-item";

    const info = document.createElement("div");
    info.className = "link-info";

    const meta = document.createElement("small");
    meta.textContent = `${item.provider} · ${item.file}`;

    if (item.provider === "HTML embed") {
      const code = document.createElement("small");
      code.textContent = item.url;
      info.append(meta, code);
    } else {
      const anchor = document.createElement("a");
      anchor.href = item.url;
      anchor.target = "_blank";
      anchor.rel = "noopener noreferrer";
      anchor.textContent = item.url;
      info.append(meta, anchor);
    }

    const copy = document.createElement("button");
    copy.type = "button";
    copy.textContent = "Copy";

    copy.addEventListener("click", () => {
      copyText(item.url, copy);
    });

    row.append(info, copy);
    fragment.append(row);
  }

  $("linkList").replaceChildren(fragment);
}

async function copyText(value, button) {
  const original = button.textContent;

  try {
    await navigator.clipboard.writeText(value);
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
  const button = $("generate");

  clearError();
  $("results").hidden = true;
  setStatus("Preparing...");

  button.disabled = true;
  button.textContent = "Scanning...";

  try {
    const parsed = parseRepository($("repo").value);
    const branch = $("branch").value.trim();
    validateBranch(branch);

    const selected = selectedNames();

    if (!selected.length) {
      throw new Error("Select at least one provider.");
    }

    const npmRequired = selected.some(name =>
      name === "unpkg.com" || name === "esm.sh"
    );

    const npmValue = $("npmPackage").value.trim();

    if (npmRequired && !npmValue) {
      throw new Error(
        "unpkg.com and esm.sh require an npm package name."
      );
    }

    options = {
      npm: npmRequired
        ? validateNpmPackage(npmValue)
        : "",
      s3: selected.includes("Amazon S3")
        ? validateBucket($("s3Bucket").value)
        : "",
      surge: selected.includes("Surge-style")
        ? validateDomain($("surgeDomain").value)
        : ""
    };

    const limit = Number($("limit").value);

    if (
      !Number.isSafeInteger(limit) ||
      limit < 1 ||
      limit > MAX_LINKS
    ) {
      throw new Error(
        "Maximum links must be between 1 and 100,000,000."
      );
    }

    maxLinks = limit;
    pageSize = Number($("pageSize").value);

    let discoveredFiles;

    if ($("mode").value === "repository") {
      setStatus("Retrieving GitHub repository files...");

      discoveredFiles = await scanRepository(
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

      discoveredFiles = [path];
    }

    if (requestId !== generationId) return;

    if (!discoveredFiles.length) {
      throw new Error("No files found.");
    }

    files = discoveredFiles;
    activeProviders = selected;
    repoInfo = { ...parsed, branch };
    currentPage = 0;

    renderPage();

    setStatus(
      `Found ${files.length.toLocaleString()} files. ` +
      `${totalLinks().toLocaleString()} candidate links.`
    );
  } catch (error) {
    if (requestId === generationId) {
      showError(error.message);
      setStatus("");
    }
  } finally {
    if (requestId === generationId) {
      button.disabled = false;
      button.textContent = "✦ Generate Links";
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
  if ((currentPage + 1) * pageSize < totalLinks()) {
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
  activeProviders = [];
  repoInfo = null;
  currentPage = 0;

  $("results").hidden = true;
  $("linkList").replaceChildren();

  $("generate").disabled = false;
  $("generate").textContent = "✦ Generate Links";

  clearError();
  setStatus("");

  renderOptions();
  updateMode();
});

function renderPresets() {
  const container = $("presetCards");
  const fragment = document.createDocumentFragment();

  for (const name of [...providerNames, ...specialNames]) {
    const card = document.createElement("button");
    card.className = "preset-card";
    card.type = "button";

    const title = document.createElement("strong");
    title.textContent = name;

    const description = document.createElement("span");
    description.textContent =
      specialNames.includes(name)
        ? "Special link format"
        : "Candidate CDN or file endpoint";

    card.append(title, description);

    card.addEventListener("click", () => {
      const checkbox = Array.from(
        document.querySelectorAll(
          '#providerGrid input, #specialGrid input'
        )
      ).find(input => input.value === name);

      if (checkbox) {
        checkbox.checked = true;
        checkbox.dispatchEvent(new Event("change"));
      }

      setView("generator");
    });

    fragment.append(card);
  }

  container.replaceChildren(fragment);
}

renderOptions();
renderPresets();
updateMode();
