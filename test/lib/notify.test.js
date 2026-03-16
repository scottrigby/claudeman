import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { execa } from "execa";
import net from "net";
import path from "path";

const NOTIFY_CLI = path.resolve(import.meta.dirname, "../../lib/notify.js");

describe("notify", () => {
  let server;
  let received;
  let port;

  beforeEach(async () => {
    received = [];

    // Create a simple TCP server to receive notifications
    server = net.createServer((socket) => {
      let data = "";
      socket.on("data", (chunk) => (data += chunk));
      socket.on("end", () => {
        received.push(data);
        socket.write("received\n");
        socket.end();
      });
    });

    // Find an available port
    await new Promise((resolve) => {
      server.listen(0, () => {
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
      "localhost",
      "-p",
      String(port),
      "complete",
      "Test message",
    ]);

    expect(received).toHaveLength(1);
    const lines = received[0].split("\n");
    expect(lines[0]).toBe("complete");
    expect(lines[3]).toBe("Test message");
  });

  it("defaults to complete type", async () => {
    await execa("node", [NOTIFY_CLI, "-h", "localhost", "-p", String(port)]);

    expect(received).toHaveLength(1);
    const lines = received[0].split("\n");
    expect(lines[0]).toBe("complete");
    expect(lines[3]).toBe("Task complete");
  });

  it("sends question type", async () => {
    await execa("node", [
      NOTIFY_CLI,
      "-h",
      "localhost",
      "-p",
      String(port),
      "question",
      "Need input",
    ]);

    expect(received).toHaveLength(1);
    const lines = received[0].split("\n");
    expect(lines[0]).toBe("question");
    expect(lines[3]).toBe("Need input");
  });

  it("sends info type", async () => {
    await execa("node", [
      NOTIFY_CLI,
      "-h",
      "localhost",
      "-p",
      String(port),
      "info",
      "Status update",
    ]);

    expect(received).toHaveLength(1);
    const lines = received[0].split("\n");
    expect(lines[0]).toBe("info");
  });

  it("includes TERM_PROGRAM and TERM_ID from environment", async () => {
    await execa(
      "node",
      [NOTIFY_CLI, "-h", "localhost", "-p", String(port), "complete", "test"],
      {
        env: {
          ...process.env,
          TERM_PROGRAM: "ghostty",
          TERM_ID: "abc123",
        },
      },
    );

    expect(received).toHaveLength(1);
    const lines = received[0].split("\n");
    expect(lines[1]).toBe("ghostty");
    expect(lines[2]).toBe("abc123");
  });

  it("handles multi-word messages", async () => {
    await execa("node", [
      NOTIFY_CLI,
      "-h",
      "localhost",
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
    const lines = received[0].split("\n");
    expect(lines[3]).toBe("This is a long message");
  });

  it("fails gracefully when server is unavailable", async () => {
    server.close();

    const result = await execa(
      "node",
      [NOTIFY_CLI, "-h", "localhost", "-p", String(port), "complete", "test"],
      { reject: false },
    );

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("Failed to connect");
  });
});
