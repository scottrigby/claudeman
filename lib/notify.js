// Trigger a TCP listener on the host from inside a Podman container.
// Usage:
//   node notify.js                 // default: port 8080, message "hello from container"
//   node notify.js 9000            // custom port, default message
//   node notify.js 8080 "Hello"    // default port with custom message
//   node notify.js 9000 "Custom"   // custom port and message

const net = require('net');

// Podman host gateway
const HOST = 'host.containers.internal';

// CLI args
// If only one arg is provided and it's numeric → treat as port
// If two args provided → [port, message]
// If no args → defaults
const args = process.argv.slice(2);
let port = 8080;
let message = 'hello from container';

if (args.length === 1 && /^\d+$/.test(args[0])) {
  port = parseInt(args[0], 10);
} else if (args.length >= 1) {
  // If first arg looks like a port, use it; otherwise keep default port
  if (/^\d+$/.test(args[0])) {
    port = parseInt(args[0], 10);
    message = args.slice(1).join(' ') || message;
  } else {
    // First arg is message, keep default port
    message = args.join(' ');
  }
}

const WINID = process.env.WINID || '';

const timeoutMs = 2000; // 2s timeout similar to `nc -w 1`/`timeout 2`
const payload = `${WINID}\n${message}\n`;

console.log(`Triggering listener at ${HOST}:${port} with message: '${message}'`);

const socket = new net.Socket();

// Ensure we exit on timeout
const timeout = setTimeout(() => {
  console.error('❌ Failed to connect to listener (timeout)');
  socket.destroy();
  process.exitCode = 1;
}, timeoutMs);

// On connection, write payload then end
socket.once('connect', () => {
  socket.write(payload, (err) => {
    if (err) {
      console.error('❌ Write error:', err.message);
      clearTimeout(timeout);
      socket.destroy();
      process.exit(1);
      return;
    }
    // Half close (FIN) — server should read and close
    socket.end();
  });
});

// If remote closes after receiving payload, consider it success
socket.once('close', (hadError) => {
  clearTimeout(timeout);
  if (hadError) {
    console.error('❌ Connection closed due to error');
    process.exitCode = 1;
  } else {
    console.log('✅ Successfully triggered listener!');
    process.exitCode = 0;
  }
});

// Error handler (ECONNREFUSED, ENETUNREACH, etc.)
socket.once('error', (err) => {
  clearTimeout(timeout);
  console.error(`❌ Failed to connect to listener: ${err.code || err.message}`);
  process.exit(1);
});

// Initiate connection
socket.connect({ host: HOST, port });
