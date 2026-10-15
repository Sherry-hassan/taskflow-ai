import http from 'node:http';
import { SMTPServer } from 'smtp-server';
import { simpleParser } from 'mailparser';

// A local-only SMTP catcher, standing in for a real email provider during
// E2E runs. The real server (Phase 2's emailProvider.js, unmodified) sends
// real SMTP traffic here instead of a real provider — no real email is ever
// sent, and no real recipient, production credential, or paid service is
// involved. This exists specifically so the invitation E2E journey can
// capture the real generated acceptance link, the same way a real inbox
// would receive it — there is no other legitimate way to recover the raw
// invitation token (only its one-way hash is ever persisted, by design).
//
// Runs in the globalSetup process; test files run in separate worker
// processes, so captured messages are exposed over a small local HTTP
// control API (GET /messages/:email) rather than via an in-process
// reference — the same pattern used for the Anthropic fixture's control
// channel. Fixed, dedicated ports (not 0/dynamic) — this process only ever
// runs once per E2E run, in an isolated environment, so a fixed port is
// simpler and more predictable than address()-based discovery.
export const SMTP_CATCHER_PORT = 2525;
export const SMTP_CATCHER_CONTROL_PORT = 2526;

export function startSmtpCatcher() {
  const messagesByRecipient = new Map();

  const smtpServer = new SMTPServer({
    disabledCommands: ['AUTH', 'STARTTLS'],
    onData(stream, session, callback) {
      simpleParser(stream, (err, parsed) => {
        if (!err) {
          const recipients = session.envelope.rcptTo.map((r) => r.address.toLowerCase());
          for (const address of recipients) {
            const existing = messagesByRecipient.get(address) || [];
            existing.push({ text: parsed.text || '', html: parsed.html || '' });
            messagesByRecipient.set(address, existing);
          }
        }
        callback();
      });
    },
  });

  const controlServer = http.createServer((req, res) => {
    const match = req.url.match(/^\/messages\/([^/?]+)/);
    if (req.method === 'GET' && match) {
      const address = decodeURIComponent(match[1]).toLowerCase();
      const messages = messagesByRecipient.get(address);
      if (!messages || messages.length === 0) {
        res.writeHead(404, { 'Content-Type': 'application/json' }).end(JSON.stringify({ found: false }));
        return;
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ found: true, message: messages[messages.length - 1] }));
      return;
    }
    res.writeHead(404).end();
  });

  return new Promise((resolve, reject) => {
    smtpServer.on('error', reject);
    smtpServer.listen(SMTP_CATCHER_PORT, '127.0.0.1', () => {
      controlServer.listen(SMTP_CATCHER_CONTROL_PORT, '127.0.0.1', () => {
        resolve({
          smtpServer,
          controlServer,
          smtpPort: SMTP_CATCHER_PORT,
          controlUrl: `http://127.0.0.1:${SMTP_CATCHER_CONTROL_PORT}`,
        });
      });
    });
  });
}
