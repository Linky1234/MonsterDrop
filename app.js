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
  "raw.githack.com",
  "raw.githubusercontent.com"
]);

let files = [];
let activeProviders = [];
let repoInfo = null;
let currentPage = 0;
let pageSize = 100;
let maxLinks = MAX_LINKS;
let generationId = 0;
let options = {};

let endingSettings = {
  mode: "none",
  custom: "123456",
  start: 1,
  count: 1,
  digits: 6,
  seed: 0
};

let checkerResults = [];
let checkerRun = 0;

// NAVIGATION

function setView(name) {
  const views = [
    "generator",
    "presets",
    "checker",
    "about"
  ];

  for (const view of views) {
    $(view + "View").hidden = view !== name;
  }

  document.querySelectorAll(".nav").forEach(button => {
    button.classList.toggle(
      "active",
      button.dataset.view === name
    );
  });

  const titles = {
    generator: "Generator",
    presets: "Providers",
    checker: "URL Checker",
    about: "About"
  };

  $("pageTitle").textContent =
    "MonsterDrop / " + titles[name];
}

document.querySelectorAll(".nav").forEach(button => {
  button.addEventListener("click", () => {
    setView(button.dataset.view);
  });
});

// GENERATOR CONTROLS

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

function updateMode(selected = selectedNames()) {
  const s3Only = selected.length === 1 && selected[0] === "Amazon S3";
  const mode = $("mode");
  if (s3Only) mode.value = "file";
  mode.disabled = s3Only;
  $("fileField").hidden = mode.value !== "file";
  $("repo").required = !s3Only;
  $("branch").required = !s3Only;

  for (const id of ["repoField", "branchField"]) {
    const field = $(id);
    if (field) field.hidden = s3Only;
  }
}

$("mode").addEventListener("change", () => updateMode());

function updateEndingFields() {
  const mode = $("endingMode").value;

  $("customEndingField").hidden =
    mode !== "custom";

  $("startNumberField").hidden =
    !["sequential", "bareQuery"].includes(mode);

  $("endingCountField").hidden =
    mode !== "sequential" &&
    mode !== "random";

  $("randomDigitsField").hidden =
    mode !== "random";

  for (const id of ["queryTemplateField", "queryCountField"]) {
    const field = $(id);
    if (field) field.hidden = id === "queryCountField"
      ? !["query", "randomQuery", "bareQuery"].includes(mode)
      : mode !== "query";
  }

  for (const id of ["randomQueryTemplateField", "queryShuffleField"]) {
    const field = $(id);
    if (field) field.hidden = mode !== "randomQuery";
  }
}

$("endingMode").addEventListener(
  "change",
  updateEndingFields
);

function readEndingSettings() {
  const mode = $("endingMode").value;
  const custom = $("customEnding").value.trim();
  const start = Number($("startNumber").value);
  const count = Number($("endingCount").value);
  const digits = Number($("randomDigits").value);

  if (mode === "bareQuery") {
    const variants = Number($("queryCount").value);
    if (!Number.isSafeInteger(variants) || variants < 1 || variants > MAX_LINKS ||
        !Number.isSafeInteger(start) || start < 0 ||
        !Number.isSafeInteger(start + (variants - 1))) {
      throw new Error("Enter a valid starting number and number of query variants.");
    }
    return { mode, count: variants, start };
  }

  if (mode === "randomQuery") {
    return readRandomQuerySettings();
  }

  if (mode === "query") {
    const template = $("queryTemplate").value.trim().replace(/^\?/, "");
    const pairs = [...new URLSearchParams(template)];
    const variants = Number($("queryCount").value);

    if (pairs.some(([key]) => !key) || !pairs.some(([, value]) => value.includes("{n}"))) {
      throw new Error("Enter query parameters with {n} in at least one value.");
    }

    if (!Number.isSafeInteger(variants) || variants < 1 || variants > MAX_LINKS) {
      throw new Error("Enter a valid number of query variants.");
    }

    return { mode, count: variants, pairs };
  }

  if (
    !["none", "custom", "sequential", "random"]
      .includes(mode)
  ) {
    throw new Error("Invalid ending mode.");
  }

  if (
    mode === "custom" &&
    (
      !custom ||
      custom.includes("/") ||
      custom.includes("\\") ||
      custom === "." ||
      custom === ".."
    )
  ) {
    throw new Error(
      "Enter a valid custom ending without slashes."
    );
  }

  if (
    ["sequential", "random"].includes(mode) &&
    (
      !Number.isSafeInteger(count) ||
      count < 1 ||
      count > MAX_LINKS
    )
  ) {
    throw new Error(
      "Enter a valid number of endings."
    );
  }

  if (
    mode === "sequential" &&
    (
      !Number.isSafeInteger(start) ||
      start < 0 ||
      start + count - 1 > 999999999
    )
  ) {
    throw new Error(
      "Invalid sequential number range."
    );
  }

  if (
    mode === "random" &&
    (
      !Number.isSafeInteger(digits) ||
      digits < 1 ||
      digits > 12 ||
      count > 10 ** digits
    )
  ) {
    throw new Error(
      "Invalid random digits or count."
    );
  }

  return {
    mode,
    custom,
    start,
    count: ["sequential", "random"].includes(mode)
      ? count
      : 1,
    digits,
    seed: Math.floor(Math.random() * 1000000)
  };
}

function readRandomQuerySettings() {
  const input = $("randomQueryTemplate").value.trim().replace(/^\?/, "");
  const pairs = [...new URLSearchParams(input)];
  const count = Number($("queryCount").value);

  if (pairs.some(([key]) => !key)) {
    throw new Error("Give each query parameter a name.");
  }
  if (new Set(pairs.map(([key]) => key)).size !== pairs.length) {
    throw new Error("Use each parameter name once in a random query template.");
  }
  if (!Number.isSafeInteger(count) || count < 1 || count > MAX_LINKS) {
    throw new Error("Enter a valid number of query variants.");
  }

  let uniqueRange;
  const parameters = pairs.map(([key, value]) => ({
    key,
    parts: value.split(/(\{rand:[^{}]*\})/).map((part, position) => {
      if (position % 2 === 0) return part;
      const match = /^\{rand:([1-9]|1[0-2])\}$/.exec(part);

      if (!match) {
        throw new Error("Use a digit length from 1 to 12, like {rand:8}.");
      }

      const digits = Number(match[1]);
      const range = 10 ** digits;
      uniqueRange = Math.max(uniqueRange ?? 0, range);

      // A step coprime with the range visits every value before repeating.
      const step = 10 * Math.floor(Math.random() * 100000) +
        [1, 3, 7, 9][Math.floor(Math.random() * 4)];
      return { digits, range, step, offset: Math.floor(Math.random() * range) };
    })
  }));

  if (!uniqueRange) {
    throw new Error("Put {rand:8} or another random number placeholder in a parameter value.");
  }
  if (count > uniqueRange) {
    throw new Error("Use more digits in a random value or request fewer variants.");
  }

  return {
    mode: "randomQuery",
    count,
    parameters,
    shuffle: $("queryShuffle").checked,
    seed: Math.floor(Math.random() * 0x100000000)
  };
}

function randomQueryAt(index) {
  const pairs = endingSettings.parameters.map(({ key, parts }) => [
    key,
    parts.map(part => {
      if (typeof part === "string") return part;
      const value = (part.offset + index * part.step) % part.range;
      return String(value).padStart(part.digits, "0");
    }).join("")
  ]);

  if (endingSettings.shuffle) {
    let state = (endingSettings.seed ^ Math.imul(index + 1, 0x9e3779b1)) >>> 0;

    for (let position = pairs.length - 1; position > 0; position--) {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      const other = Math.floor(state / 0x100000000 * (position + 1));
      [pairs[position], pairs[other]] = [pairs[other], pairs[position]];
    }
  }

  return "?" + new URLSearchParams(pairs).toString();
}

function endingAt(index) {
  if (endingSettings.mode === "bareQuery") {
    return "?" + (endingSettings.start + index);
  }

  if (endingSettings.mode === "randomQuery") {
    return randomQueryAt(index);
  }

  if (endingSettings.mode === "query") {
    const params = new URLSearchParams(
      endingSettings.pairs.map(([key, value]) => [
        key, value.replaceAll("{n}", String(index + 1))
      ])
    );
    return "?" + params.toString();
  }

  if (endingSettings.mode === "none") {
    return "";
  }

  if (endingSettings.mode === "custom") {
    return "/" + encodeURIComponent(
      endingSettings.custom
    );
  }

  if (endingSettings.mode === "sequential") {
    return "/" + (
      endingSettings.start + index
    );
  }

  const modulus = 10 ** endingSettings.digits;

  const value = (
    index * 7919 + endingSettings.seed
  ) % modulus;

  return "/" + String(value).padStart(
    endingSettings.digits,
    "0"
  );
}

// PROVIDERS

function selectedNames() {
  return Array.from(
    document.querySelectorAll(
      "#providerGrid input:checked, " +
      "#specialGrid input:checked"
    )
  ).map(input => input.value);
}

function updateExtras() {
  const selected = selectedNames();

  const npm =
    selected.includes("unpkg.com") ||
    selected.includes("esm.sh");

  const s3 = selected.includes("Amazon S3");
  const surge = selected.includes("Surge-style");

  $("npmField").hidden = !npm;
  $("s3Field").hidden = !s3;
  const s3StyleField = $("s3StyleField");
  if (s3StyleField) s3StyleField.hidden = !s3;
  $("surgeField").hidden = !surge;

  $("extraFields").hidden =
    !(npm || s3 || surge);

  updateMode(selected);
}

function createOption(name) {
  const label = document.createElement("label");
  label.className = "provider-option";

  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.value = name;
  checkbox.checked = defaults.has(name);

  const span = document.createElement("span");
  span.textContent = name === "Surge-style"
    ? "Surge (root URL)"
    : name;

  function update() {
    label.classList.toggle(
      "selected",
      checkbox.checked
    );

    updateExtras();
  }

  checkbox.addEventListener("change", update);

  label.append(checkbox, span);

  label.classList.toggle(
    "selected",
    checkbox.checked
  );

  return label;
}

function renderOptions() {
  $("providerGrid").replaceChildren(
    ...providerNames.map(createOption)
  );

  $("specialGrid").replaceChildren(
    ...specialNames.map(createOption)
  );

  updateExtras();
}

function selectProviders(checked) {
  document.querySelectorAll(
    "#providerGrid input"
  ).forEach(input => {
    input.checked = checked;

    input.closest(".provider-option")
      .classList.toggle("selected", checked);
  });

  updateExtras();
}

$("selectAll").addEventListener("click", () => {
  selectProviders(true);
});

$("clearProviders").addEventListener("click", () => {
  selectProviders(false);
});

// GITHUB REPOSITORY SCANNING

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
    !/^[a-z0-9-]+$/i.test(parts[0]) ||
    !/^[a-z0-9._-]+$/i.test(parts[1])
  ) {
    throw new Error(
      "Enter a valid GitHub owner/repository."
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
    throw new Error("Enter a valid branch.");
  }
}

function encodePath(path) {
  return path.split("/")
    .map(encodeURIComponent)
    .join("/");
}

async function scanRepository(owner, repo, branch) {
  const api =
    "https://api.github.com/repos/" +
    encodeURIComponent(owner) + "/" +
    encodeURIComponent(repo) +
    "/git/trees/" +
    encodeURIComponent(branch) +
    "?recursive=1";

  const response = await fetch(api, {
    headers: {
      Accept: "application/vnd.github+json"
    }
  });

  if (!response.ok) {
    if (
      response.status === 403 ||
      response.status === 429
    ) {
      throw new Error(
        "GitHub API rate limit reached."
      );
    }

    if (response.status === 404) {
      throw new Error(
        "Public repository or branch not found."
      );
    }

    throw new Error(
      "GitHub API error: " + response.status
    );
  }

  const data = await response.json();

  if (data.truncated) {
    throw new Error(
      "Repository tree is too large for a complete scan."
    );
  }

  if (!Array.isArray(data.tree)) {
    throw new Error(
      "GitHub returned an invalid file tree."
    );
  }

  return data.tree
    .filter(item => item.type === "blob")
    .map(item => item.path);
}

// LINK GENERATION

function buildLink(provider, file) {
  const path = encodePath(file);
  if (provider === "Amazon S3") {
    return options.s3Style === "path"
      ? `https://s3.amazonaws.com/${options.s3}/${path}`
      : `https://${options.s3}.s3.amazonaws.com/${path}`;
  }

  const owner = encodeURIComponent(repoInfo.owner);
  const repo = encodeURIComponent(repoInfo.repo);
  const branch = encodeURIComponent(repoInfo.branch);

  const ghPath =
    `${owner}/${repo}@${branch}/${path}`;

  const rawPath =
    `${owner}/${repo}/${branch}/${path}`;

  if (
    provider.endsWith(".jsdelivr.net") ||
    provider === "jsdelivr.b-cdn.net"
  ) {
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

  if (provider === "Surge-style") {
    return `https://${options.surge}/`;
  }

  if (provider === "HTML embed") {
    return `https://raw.githack.com/${rawPath}`;
  }

  throw new Error("Unknown provider: " + provider);
}

function normalizeSurgeDomain(value) {
  const input = value.trim();
  let url;

  try {
    url = new URL(
      /^https?:\/\//i.test(input)
        ? input
        : "https://" + input
    );
  } catch {
    throw new Error(
      "Enter a valid Surge domain or URL."
    );
  }

  if (
    !["https:", "http:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.port ||
    !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.surge\.sh$/i
      .test(url.hostname)
  ) {
    throw new Error(
      "Enter a domain such as example.surge.sh."
    );
  }

  return url.hostname.toLowerCase();
}

function fileProviders() {
  return activeProviders.filter(
    name => name !== "Surge-style"
  );
}

function fileLinkCount() {
  return files.length *
    fileProviders().length *
    endingSettings.count;
}

function totalLinks() {
  return Math.min(
    maxLinks,
    fileLinkCount() +
      (activeProviders.includes("Surge-style") ? 1 : 0)
  );
}

function getLinkAt(index) {
  if (index < 0 || index >= totalLinks()) {
    throw new Error("Link index out of range.");
  }

  const hasSurge =
    activeProviders.includes("Surge-style");

  // Surge produces one root URL, shown first.
  // Repository file paths and endings do not apply.
  if (hasSurge && index === 0) {
    return {
      file: "Site homepage",
      provider: "Surge-style",
      url: buildLink("Surge-style", "")
    };
  }

  const providers = fileProviders();
  const endings = endingSettings.count;
  const combinations = endings * providers.length;

  const fileOffset = index - (hasSurge ? 1 : 0);
  const fileIndex = Math.floor(
    fileOffset / combinations
  );

  const remainder = fileOffset % combinations;

  const providerIndex = Math.floor(
    remainder / endings
  );

  const endingIndex = remainder % endings;
  const file = files[fileIndex];
  const provider = providers[providerIndex];

  const url =
    buildLink(provider, file) +
    endingAt(endingIndex);

  if (provider === "HTML embed") {
    const escaped = url
      .replaceAll("&", "&amp;")
      .replaceAll('"', "&quot;")
      .replaceAll("<", "&lt;");

    return {
      file,
      provider,
      url:
        `<iframe src="${escaped}" ` +
        `title="Embedded file" ` +
        `loading="lazy"></iframe>`
    };
  }

  return { file, provider, url };
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
  const copyAllStatus = $("copyAllStatus");
  if (copyAllStatus) copyAllStatus.textContent = "";

  $("resultsSummary").textContent =
    `${total.toLocaleString()} candidate links · ` +
    `${files.length.toLocaleString()} files`;

  const hostingNote = $("hostingNote");
  if (hostingNote) {
    const usesJsDelivr = fileProviders().some(provider =>
      provider.endsWith(".jsdelivr.net") || provider === "jsdelivr.b-cdn.net"
    );
    const notes = [];

    if (usesJsDelivr && files.some(file => /\.html?$/i.test(file))) {
      notes.push("jsDelivr serves GitHub HTML files as source text. Use a web host to open the page.");
    }

    if (activeProviders.includes("Amazon S3")) {
      notes.push("S3 links require the file to already exist and be publicly readable in that bucket.");
    }

    hostingNote.textContent = notes.join(" ");
    hostingNote.hidden = notes.length === 0;
  }

  $("pageLabel").textContent =
    `Page ${currentPage + 1} of ${pages}`;

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
    meta.textContent =
      `${item.provider} · ${item.file}`;

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

function showManualCopy(value) {
  const dialog = document.createElement("dialog");
  dialog.setAttribute("aria-labelledby", "manualCopyTitle");
  dialog.style.width = "min(90%, 48rem)";
  dialog.style.color = "#e7faff";
  dialog.style.background = "#102735";
  dialog.style.border = "1px solid #3b6879";
  dialog.style.borderRadius = "10px";

  const title = document.createElement("h2");
  title.id = "manualCopyTitle";
  title.textContent = "Copy links manually";

  const instructions = document.createElement("p");
  instructions.id = "manualCopyInstructions";
  instructions.textContent =
    "Press Ctrl+C (Windows) or Command+C (Mac) to copy the selected text.";

  const field = document.createElement("textarea");
  field.setAttribute("aria-label", "Links to copy");
  field.setAttribute("aria-describedby", instructions.id);
  field.readOnly = true;
  field.rows = 8;
  field.value = value;

  const close = document.createElement("button");
  close.type = "button";
  close.className = "secondary";
  close.textContent = "Done";
  close.addEventListener("click", () => dialog.close());
  dialog.addEventListener("close", () => dialog.remove());

  dialog.append(title, instructions, field, close);
  document.body.append(dialog);
  dialog.showModal();
  field.focus();
  field.select();
}

async function writeClipboard(value) {
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    showManualCopy(value);
    return false;
  }
}

async function copyText(value, button) {
  if (!await writeClipboard(value)) return;

  const original = button.textContent;
  button.textContent = "Copied!";
  setTimeout(() => {
    button.textContent = original;
  }, 1500);
}

$("generatorForm").addEventListener(
  "submit",
  async event => {
    event.preventDefault();

    const requestId = ++generationId;
    const button = $("generate");

    clearError();
    $("results").hidden = true;
    setStatus("Preparing...");

    button.disabled = true;
    button.textContent = "Scanning...";

    try {
      const selected = selectedNames();

      if (!selected.length) {
        throw new Error(
          "Select at least one provider."
        );
      }

      const s3Only = selected.length === 1 && selected[0] === "Amazon S3";
      const branch = $("branch").value.trim();
      const parsed = s3Only ? null : parseRepository($("repo").value);
      if (!s3Only) validateBranch(branch);

      const nextEnding = readEndingSettings();

      if (["query", "randomQuery", "bareQuery"].includes(nextEnding.mode) && selected.every(name => name === "Surge-style")) {
        throw new Error("Select a file provider such as cdn.jsdelivr.net for query variants.");
      }

      const npmRequired =
        selected.includes("unpkg.com") ||
        selected.includes("esm.sh");

      const npm = $("npmPackage").value.trim();

      if (npmRequired && !npm) {
        throw new Error(
          "Enter an npm package and version."
        );
      }

      if (
        npmRequired &&
        !/^(?:@[a-z0-9._-]+\/)?[a-z0-9._-]+(?:@[a-z0-9._+-]+)?$/i
          .test(npm)
      ) {
        throw new Error("Invalid npm package.");
      }

      const nextOptions = {
        npm,
        s3: $("s3Bucket").value.trim(),
        s3Style: $("s3Style")?.value ?? "virtual",
        surge: $("surgeDomain").value.trim()
      };

      if (
        selected.includes("Amazon S3") &&
        !/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/
          .test(nextOptions.s3)
      ) {
        throw new Error("Invalid S3 bucket.");
      }

      if (selected.includes("Surge-style")) {
        nextOptions.surge = normalizeSurgeDomain(
          nextOptions.surge
        );
      }

      const limit = Number($("limit").value);
      const size = Number($("pageSize").value);

      if (
        !Number.isSafeInteger(limit) ||
        limit < 1 ||
        limit > MAX_LINKS
      ) {
        throw new Error("Invalid maximum links.");
      }

      if (![100, 1000].includes(size)) {
        throw new Error("Invalid page size.");
      }

      let discoveredFiles;

      if (!s3Only && $("mode").value === "repository") {
        setStatus("Scanning public repository...");

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
          throw new Error("Invalid file path.");
        }

        discoveredFiles = [path];
      }

      if (requestId !== generationId) return;

      if (!discoveredFiles.length) {
        throw new Error("No files found.");
      }

      files = discoveredFiles;
      activeProviders = selected;
      repoInfo = s3Only ? null : { ...parsed, branch };
      options = nextOptions;
      endingSettings = nextEnding;
      maxLinks = limit;
      pageSize = size;
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
  }
);

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

  const end = Math.min(
    start + pageSize,
    totalLinks()
  );

  const urls = [];

  for (let i = start; i < end; i++) {
    urls.push(getLinkAt(i).url);
  }

  copyText(urls.join("\n"), $("copyPage"));
});

$("copyAll")?.addEventListener("click", async () => {
  const button = $("copyAll");
  const status = $("copyAllStatus");
  const count = totalLinks();
  if (!count || button.disabled) return;

  button.disabled = true;
  status.textContent = "";

  try {
    const urls = [];
    const maxCharacters = 16 * 1024 * 1024;
    let characters = 0;

    for (let index = 0; index < count; index++) {
      const url = getLinkAt(index).url;
      characters += url.length + (index > 0 ? 1 : 0);

      if (characters > maxCharacters) {
        status.textContent =
          "This batch is too large to copy at once. Use Copy Page or generate a smaller batch.";
        return;
      }

      urls.push(url);
    }

    if (await writeClipboard(urls.join("\n"))) {
      status.textContent = "Copied all " + count.toLocaleString() + " links.";
    }
  } catch {
    status.textContent = "Copy failed. Check that your browser allows clipboard access and try again.";
  } finally {
    button.disabled = false;
  }
});

$("clear").addEventListener("click", () => {
  generationId++;
  $("generatorForm").reset();

  files = [];
  activeProviders = [];
  repoInfo = null;
  currentPage = 0;
  options = {};

  endingSettings = {
    mode: "none",
    custom: "123456",
    start: 1,
    count: 1,
    digits: 6,
    seed: 0
  };

  $("results").hidden = true;
  $("linkList").replaceChildren();

  $("generate").disabled = false;
  $("generate").textContent = "✦ Generate Links";

  clearError();
  setStatus("");
  renderOptions();
  updateMode();
  updateEndingFields();
});

function renderPresets() {
  const container = $("presetCards");
  const fragment = document.createDocumentFragment();

  for (const name of [
    ...providerNames,
    ...specialNames
  ]) {
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
          "#providerGrid input, #specialGrid input"
        )
      ).find(input => input.value === name);

      if (checkbox) {
        checkbox.checked = true;
        checkbox.dispatchEvent(
          new Event("change")
        );
      }

      setView("generator");
    });

    fragment.append(card);
  }

  container.replaceChildren(fragment);
}

// URL CHECKER

function parseCheckUrl(value) {
  const trimmed = value.trim();

  if (!trimmed) {
    throw new Error("Empty URL");
  }

  let url;

  try {
    url = new URL(trimmed);
  } catch {
    throw new Error("Invalid URL format");
  }

  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error(
      "Only HTTP and HTTPS are supported"
    );
  }

  if (!url.hostname || url.username || url.password) {
    throw new Error(
      "Invalid or unsupported URL"
    );
  }

  return url.href;
}

async function diagnoseUrl(url) {
  const controller = new AbortController();

  const timeout = setTimeout(() => {
    controller.abort();
  }, 7000);

  try {
    const response = await fetch(url, {
      method: "HEAD",
      mode: "cors",
      credentials: "omit",
      redirect: "follow",
      signal: controller.signal
    });

    if (response.ok) {
      return {
        status: "Reachable",
        detail: `HTTP ${response.status}`
      };
    }

    if (
      response.status === 405 ||
      response.status === 501
    ) {
      return {
        status: "Inconclusive",
        detail:
          "Server does not support HEAD requests"
      };
    }

    return {
      status: "HTTP Error",
      detail: `HTTP ${response.status}`
    };
  } catch (error) {
    return {
      status: "Inconclusive",
      detail:
        error.name === "AbortError"
          ? "Request timed out"
          : "Browser blocked request or network failed"
    };
  } finally {
    clearTimeout(timeout);
  }
}

function renderCheckerResults() {
  const container = $("checkerList");
  const fragment = document.createDocumentFragment();

  for (const item of checkerResults) {
    const row = document.createElement("div");
    row.className = "link-item";

    const info = document.createElement("div");
    info.className = "link-info";

    const status = document.createElement("small");

    status.textContent =
      `${item.status} — ${item.detail}`;

    if (item.status === "Reachable") {
      status.style.color = "#38e4d2";
    } else if (
      item.status === "Invalid" ||
      item.status === "HTTP Error"
    ) {
      status.style.color = "#ff9db1";
    } else {
      status.style.color = "#91b2c1";
    }

    const link = document.createElement("a");
    link.textContent = item.url;

    if (item.status !== "Invalid") {
      link.href = item.url;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
    }

    info.append(status, link);
    row.append(info);
    fragment.append(row);
  }

  container.replaceChildren(fragment);

  $("checkerResults").hidden =
    checkerResults.length === 0;

  const reachable = checkerResults.filter(
    item => item.status === "Reachable"
  ).length;

  $("checkerSummary").textContent =
    `${checkerResults.length} checked · ` +
    `${reachable} confirmed reachable`;
}

$("checkUrls").addEventListener("click", async () => {
  const run = ++checkerRun;

  const lines = $("checkerInput").value
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean);

  if (!lines.length) {
    $("checkerStatus").textContent =
      "Enter at least one URL.";
    return;
  }

  if (lines.length > 100) {
    $("checkerStatus").textContent =
      "Maximum 100 URLs per check.";
    return;
  }

  checkerResults = [];
  $("checkerResults").hidden = true;

  const button = $("checkUrls");
  button.disabled = true;
  button.textContent = "Checking...";

  try {
    for (let i = 0; i < lines.length; i++) {
      if (run !== checkerRun) return;

      const original = lines[i];

      $("checkerStatus").textContent =
        `Checking ${i + 1} of ${lines.length}...`;

      let url;

      try {
        url = parseCheckUrl(original);
      } catch (error) {
        checkerResults.push({
          url: original,
          status: "Invalid",
          detail: error.message
        });

        continue;
      }

      const result = await diagnoseUrl(url);

      if (run !== checkerRun) return;

      checkerResults.push({
        url,
        ...result
      });
    }

    renderCheckerResults();

    $("checkerStatus").textContent =
      "Checks complete. Inconclusive does not mean blocked.";
  } finally {
    if (run === checkerRun) {
      button.disabled = false;
      button.textContent = "◉ Check URLs";
    }
  }
});

$("clearChecker").addEventListener("click", () => {
  checkerRun++;

  $("checkerInput").value = "";
  checkerResults = [];

  $("checkerResults").hidden = true;
  $("checkerList").replaceChildren();
  $("checkerStatus").textContent = "";

  $("checkUrls").disabled = false;
  $("checkUrls").textContent = "◉ Check URLs";
});

$("copyCheckerResults").addEventListener(
  "click",
  () => {
    const text = checkerResults.map(item =>
      `${item.url}\t${item.status}\t${item.detail}`
    ).join("\n");

    copyText(text, $("copyCheckerResults"));
  }
);

// INITIALIZATION

const surgeHelp = document.createElement("small");
surgeHelp.className = "muted";

surgeHelp.textContent =
  "Enter an existing Surge deployment. Produces one homepage URL; " +
  "file paths and ending modes are ignored for Surge. " +
  "This does not publish a site.";

$("surgeDomain").placeholder =
  "https://example.surge.sh/";

$("surgeField").append(surgeHelp);

renderOptions();
renderPresets();
updateMode();
updateEndingFields();
setView("generator");
