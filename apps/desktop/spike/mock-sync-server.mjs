// A throwaway server for the spike screen: node spike/mock-sync-server.mjs
// It wraps the same ledger the tests use. Send header  x-chaos: drop-response | duplicate | drop-request
// to make one request fail the way a bad connection would.
import { createServer } from "node:http";
import { SyncServer } from "./sync-slice.js";

const server = new SyncServer({ lockedRegisters: new Set(["class-locked|2026-11-02"]) });
const port = Number(process.env.PORT ?? 4455);

const readBody = (req) => new Promise((resolve) => {
  const chunks = [];
  req.on("data", (c) => chunks.push(c));
  req.on("end", () => resolve(Buffer.concat(chunks).toString() || "{}"));
});
const send = (res, status, body) => {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
};

createServer(async (req, res) => {
  try {
    if (req.method === "GET" && req.url === "/sync/stats") {
      return send(res, 200, {
        applied: server.log.length,
        maxApplyCount: Math.max(0, ...server.applyCount.values()),
        ledger: server.ledger.size,
        attendanceRows: server.attendance.size,
      });
    }
    if (req.method === "POST" && req.url === "/sync/push") {
      const { deviceId, ops } = JSON.parse(await readBody(req));
      const chaos = req.headers["x-chaos"];
      if (chaos === "drop-request") return req.socket.destroy();
      let results = server.push(deviceId, ops ?? []);
      if (chaos === "duplicate") results = server.push(deviceId, ops ?? []);
      if (chaos === "drop-response") return req.socket.destroy(); // applied, but the device never hears
      return send(res, 200, { results });
    }
    send(res, 404, { error: "not found" });
  } catch (error) {
    send(res, 400, { error: String(error) });
  }
}).listen(port, "127.0.0.1", () => console.log(`mock sync server on http://127.0.0.1:${port}`));
