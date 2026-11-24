"use strict";
const http = require("node:http");
const { timingSafeEqual } = require("node:crypto");
const { isIPv4 } = require("node:net");

const origin = "https://linky1234.github.io";
const label = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
function createServer({ token, key, zone, request = fetch }) {
  if (!token || !key || key.length < 32 || !zone?.includes(".") ||
      !zone.split(".").every(part => label.test(part))) {
    throw Error("Set DYNV6_TOKEN, MONSTERDNS_KEY and MONSTERDNS_ZONE in Render.");
  }
  async function dynv6(path, body) {
    const response = await request("https://dynv6.com/api/v2/" + path, {
      method: body ? "POST" : "GET",
      headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
      redirect: "error",
      signal: AbortSignal.timeout(12000)
    });
    if (!response.ok) throw Error("dynv6 returned HTTP " + response.status + ".");
    return response.json();
  }

  let busy = false;
  return http.createServer(async (req, res) => {
    const reply = (status, body) => {
      res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" });
      res.end(JSON.stringify(body));
    };
    if (req.method === "GET" && req.url === "/health") return reply(200, { status: "ok" });
    res.setHeader("Vary", "Origin");
    if (req.headers.origin !== origin) return reply(403, { error: "Open MonsterDNS from MonsterDrop." });
    res.setHeader("Access-Control-Allow-Origin", origin);
    if (req.method === "OPTIONS" && req.url === "/records") {
      res.writeHead(204, {
        "Access-Control-Allow-Methods": "POST",
        "Access-Control-Allow-Headers": "Content-Type, X-MonsterDNS-Code"
      });
      return res.end();
    }
    if (req.method !== "POST" || req.url !== "/records") return reply(404, { error: "Unknown route." });
    const incoming = Buffer.from(String(req.headers["x-monsterdns-code"] || ""));
    const expected = Buffer.from(key);
    if (incoming.length !== expected.length || !timingSafeEqual(incoming, expected)) {
      return reply(403, { error: "Incorrect connection key." });
    }
    if (busy) return reply(409, { error: "A record is already being processed." });
    busy = true;
    let attempted = false;
    try {
      let body = "";
      for await (const chunk of req) {
        body += chunk;
        if (body.length > 2048) return reply(413, { error: "Request too large." });
      }
      let input;
      try { input = JSON.parse(body); } catch {
        return reply(400, { error: "Invalid request format." });
      }
      const { domain, name, ip } = input || {};
      if (domain !== zone || typeof name !== "string" || !label.test(name) ||
          typeof ip !== "string" || !isIPv4(ip) || name.length + zone.length > 252) {
        return reply(400, { error: "Enter the configured zone, one valid subdomain label and an IPv4 address." });
      }
      const zones = await dynv6("zones");
      const selected = zones.find(item => item.name === zone);
      if (!selected || !Number.isSafeInteger(selected.id)) {
        return reply(403, { error: "The dynv6 token cannot access the configured zone." });
      }
      const route = "zones/" + selected.id + "/records";
      const records = await dynv6(route);
      const hostname = name + "." + zone;
      const matches = records.filter(record => {
        const owner = String(record.name).toLowerCase().replace(/\.$/, "");
        return owner === name || owner === hostname;
      });
      if (matches.length) {
        if (matches.every(record => record.type === "A" && record.data === ip)) {
          return reply(200, { hostname, status: "already present" });
        }
        return reply(409, { error: "This name already has a record. Nothing was overwritten." });
      }
      attempted = true;
      await dynv6(route, { name, type: "A", data: ip });
      return reply(201, { hostname, status: "created" });
    } catch (error) {
      const detail = /^dynv6 returned HTTP \d+\.$/.test(error.message) ? error.message + " " : "";
      return reply(502, { error: detail + (attempted
        ? "Creation was not confirmed. Check the dynv6 dashboard before retrying."
        : "Could not read the zone. Check the dynv6 token and service settings.") });
    } finally {
      busy = false;
    }
  });
}

if (require.main === module) {
  createServer({
    token: process.env.DYNV6_TOKEN,
    key: process.env.MONSTERDNS_KEY,
    zone: process.env.MONSTERDNS_ZONE?.trim().toLowerCase()
  }).listen(Number(process.env.PORT) || 10000, "0.0.0.0");
}
module.exports = { createServer };
