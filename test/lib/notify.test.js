import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { execa } from "execa";
import http from "http";
import path from "path";

const NOTIFY_CLI = path.resolve(import.meta.dirname, "../../lib/notify.js");

describe("notify", () => {
  let server;
  let received;
  let port;

  beforeEach(async () => {
    received = [];

    // Create a simple HTTP server to receive notifications
    server = http.createServer((req, res) => {
      let body = "";
      req.on("data", (chunk) => (body += chunk));
      req.on("end", () => {
        received.push({
          url: req.url,
          method: req.method,
          body: JSON.parse(body),
        });
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ status: "ok" }));
      });
    });

    await new Promise((resolve) => {
      server.listen(0, "127.0.0.1", () => {
        port = server.address().port;
        resolve();
      });
    });
  });

  afterEach(() => {
    server.close();
  });

  it("sends notification with type and message", async () => {
    await execa("node", [
      NOTIFY_CLI,
      "-h",
      "127.0.0.1",
      "-p",
      String(port),
      "complete",
      "Test message",
    ]);

    expect(received).toHaveLength(1);
    expect(received[0].url).toBe("/notify");
    expect(received[0].method).toBe("POST");
    expect(received[0].body.type).toBe("complete");
    expect(received[0].body.message).toBe("Test message");
  });

  it("defaults to complete type", async () => {
    await execa("node", [NOTIFY_CLI, "-h", "127.0.0.1", "-p", String(port)]);

    expect(received).toHaveLength(1);
    expect(received[0].body.type).toBe("complete");
    expect(received[0].body.message).toBe("Task complete");
  });

  it("sends question type", async () => {
    await execa("node", [
      NOTIFY_CLI,
      "-h",
      "127.0.0.1",
      "-p",
      String(port),
      "question",
      "Need input",
    ]);

    expect(received).toHaveLength(1);
    expect(received[0].body.type).toBe("question");
    expect(received[0].body.message).toBe("Need input");
  });

  it("sends info type", async () => {
    await execa("node", [
      NOTIFY_CLI,
      "-h",
      "127.0.0.1",
      "-p",
      String(port),
      "info",
      "Status update",
    ]);

    expect(received).toHaveLength(1);
    expect(received[0].body.type).toBe("info");
  });

  it("includes TERM_PROGRAM and TERM_ID from environment", async () => {
    await execa(
      "node",
      [NOTIFY_CLI, "-h", "127.0.0.1", "-p", String(port), "complete", "test"],
      {
        env: {
          ...process.env,
          TERM_PROGRAM: "ghostty",
          TERM_ID: "abc123",
        },
      },
    );

    expect(received).toHaveLength(1);
    expect(received[0].body.termProgram).toBe("ghostty");
    expect(received[0].body.termId).toBe("abc123");
  });

  it("handles multi-word messages", async () => {
    await execa("node", [
      NOTIFY_CLI,
      "-h",
      "127.0.0.1",
      "-p",
      String(port),
      "complete",
      "This",
      "is",
      "a",
      "long",
      "message",
    ]);

    expect(received).toHaveLength(1);
    expect(received[0].body.message).toBe("This is a long message");
  });

  it("fails gracefully when server is unavailable", async () => {
    server.close();

    const result = await execa(
      "node",
      [NOTIFY_CLI, "-h", "127.0.0.1", "-p", String(port), "complete", "test"],
      { reject: false },
    );

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("Failed to connect");
  });
});
