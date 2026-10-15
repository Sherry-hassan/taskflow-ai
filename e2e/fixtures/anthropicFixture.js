import http from 'node:http';

// A minimal stand-in for the Anthropic Messages API, shaped exactly like what
// server/src/services/aiProvider.js reads (`response.content?.[0]?.text`).
// aiProvider.js is pointed at this server via ANTHROPIC_BASE_URL during E2E
// runs, so the real orchestration code runs completely unmodified — only the
// network endpoint it calls is swapped. No real, paid Anthropic API call is
// ever made during a Playwright run.
//
// Each test controls what the *next* request gets back via POST
// /__set-next-response (a tiny control channel, not part of the real
// Anthropic API surface, and not reachable outside this fixture process).
export function startAnthropicFixture() {
  let nextResponseText = JSON.stringify({ tasks: [{ title: 'Default fixture task' }] });

  const server = http.createServer((req, res) => {
    if (req.method === 'POST' && req.url === '/__set-next-response') {
      let body = '';
      req.on('data', (chunk) => {
        body += chunk;
      });
      req.on('end', () => {
        const { text } = JSON.parse(body);
        nextResponseText = text;
        res.writeHead(204).end();
      });
      return;
    }

    if (req.method === 'POST' && req.url === '/v1/messages') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ content: [{ type: 'text', text: nextResponseText }] }));
      return;
    }

    res.writeHead(404).end();
  });

  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({
        server,
        baseUrl: `http://127.0.0.1:${port}`,
        setNextResponse: async (data) => {
          await fetch(`http://127.0.0.1:${port}/__set-next-response`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: JSON.stringify(data) }),
          });
        },
      });
    });
  });
}
