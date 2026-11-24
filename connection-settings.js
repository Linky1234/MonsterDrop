"use strict";

document.addEventListener("DOMContentLoaded", () => {
  const connections = [
    {
      name: "Discord",
      storage: "monsterdrop.connection.discord.v1",
      url: "discordServerURL",
      key: "discordSenderCode",
      local: "http://127.0.0.1:43130",
      busy: "sendDiscord"
    },
    {
      name: "Surge",
      storage: "monsterdrop.connection.surge.v1",
      url: "publisherServerURL",
      key: "helperCode",
      local: "http://127.0.0.1:43127"
    },
    {
      name: "MonsterDNS",
      storage: "monsterdrop.connection.dns.v1",
      url: "monsterDNSURL",
      key: "monsterDNSCode",
      busy: "monsterDNSCreate"
    }
  ];

  function normalizeURL(value, local) {
    let url;
    try { url = new URL(value.trim()); } catch {
      throw new Error("Enter a complete HTTPS server URL before saving.");
    }
    if ((url.protocol !== "https:" && url.origin !== local) ||
        url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
      throw new Error(local
        ? "Use the HTTPS server address without a path, or the local helper address."
        : "Use the HTTPS server address without a path.");
    }
    return url.origin;
  }

  for (const config of connections) {
    const urlInput = document.getElementById(config.url);
    const keyInput = document.getElementById(config.key);
    const panel = keyInput?.closest(".panel, #monsterDNSForm");
    if (!urlInput || !keyInput || !panel) continue;

    const controls = document.createElement("div");
    controls.className = "actions";
    const save = document.createElement("button");
    save.id = "save" + config.name + "Connection";
    save.type = "button";
    save.className = "secondary";
    save.textContent = "Save connection";
    const forget = document.createElement("button");
    forget.id = "forget" + config.name + "Connection";
    forget.type = "button";
    forget.className = "secondary";
    forget.textContent = "Forget saved connection";
    controls.append(save, forget);

    const note = document.createElement("p");
    note.className = "muted";
    note.textContent = "Saves the server URL and connection key in this browser profile. Anyone using this profile can access them. Use Forget to remove them.";

    const status = document.createElement("p");
    status.id = config.name.toLowerCase() + "ConnectionSaveStatus";
    status.className = "muted";
    status.setAttribute("role", "status");
    panel.append(controls, note, status);

    function isBusy() {
      return urlInput.disabled || keyInput.disabled ||
        Boolean(config.busy && document.getElementById(config.busy)?.disabled);
    }

    function apply(url, key) {
      urlInput.value = url;
      keyInput.value = key;
      urlInput.dispatchEvent(new Event("input", { bubbles: true }));
      keyInput.dispatchEvent(new Event("input", { bubbles: true }));
    }

    try {
      const raw = localStorage.getItem(config.storage);
      if (raw) {
        const saved = JSON.parse(raw);
        if (saved?.version !== 1 || typeof saved.url !== "string" ||
            typeof saved.key !== "string" || !saved.key || /\s/.test(saved.key) ||
            saved.key.length > 512) throw new Error("Invalid saved settings.");
        apply(normalizeURL(saved.url, config.local), saved.key);
        status.textContent = "Saved " + config.name + " connection loaded.";
      }
    } catch {
      status.textContent = "Saved settings could not be loaded. Enter them manually; this browser may block storage.";
    }

    save.addEventListener("click", () => {
      if (isBusy()) {
        status.textContent = "Wait for the current operation to finish before saving.";
        return;
      }
      try {
        const url = normalizeURL(urlInput.value, config.local);
        const key = keyInput.value.trim();
        if (!key || /\s/.test(key) || key.length > 512) {
          throw new Error("Enter your connection key before saving.");
        }
        localStorage.setItem(config.storage, JSON.stringify({ version: 1, url, key }));
        status.textContent = config.name + " connection saved in this browser.";
      } catch (error) {
        status.textContent = error.name === "SecurityError" || error.name === "QuotaExceededError"
          ? "This browser blocked saving. Allow site storage or open MonsterDrop directly on GitHub Pages."
          : error.message;
      }
    });

    forget.addEventListener("click", () => {
      if (isBusy()) {
        status.textContent = "Wait for the current operation to finish before forgetting this connection.";
        return;
      }
      try {
        localStorage.removeItem(config.storage);
        apply(urlInput.defaultValue || config.local || "", "");
        status.textContent = config.name + " connection forgotten. The saved URL and key were removed.";
      } catch {
        status.textContent = "Could not remove saved settings. Check this browser's site-storage permissions.";
      }
    });
  }
});
