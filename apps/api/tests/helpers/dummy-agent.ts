/**
 * Dummy agent HTTP server for integration testing.
 * Implements SRS FR-6.1 agent communication protocol:
 * - POST /orchestration/execute — execute a stage
 * - GET /health — health check endpoint
 *
 * Runs on a random available port during tests.
 */
import http from 'http';

export interface DummyAgentOptions {
  onExecute?: (body: unknown) => { output: Record<string, unknown>; memoryWrites?: Record<string, unknown> };
  healthStatus?: string;
  simulateError?: { code: string; message: string; retryable: boolean };
  simulateDelayMs?: number;
}

export interface DummyAgent {
  url: string;
  port: number;
  server: http.Server;
  close: () => Promise<void>;
  callCount: number;
  lastRequest: unknown;
}

export function createDummyAgent(options: DummyAgentOptions = {}): Promise<DummyAgent> {
  return new Promise((resolve) => {
    let callCount = 0;
    let lastRequest: unknown = null;

    const server = http.createServer(async (req, res) => {
      const url = req.url ?? '';

      // Health endpoint
      if (req.method === 'GET' && url === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          status: options.healthStatus ?? 'healthy',
          timestamp: Date.now(),
        }));
        return;
      }

      // Execute endpoint
      if (req.method === 'POST' && url === '/orchestration/execute') {
        const chunks: Buffer[] = [];
        req.on('data', (chunk: Buffer) => chunks.push(chunk));
        req.on('end', async () => {
          callCount++;
          const body = JSON.parse(Buffer.concat(chunks).toString());
          lastRequest = body;

          // Simulate delay
          if (options.simulateDelayMs) {
            await new Promise((r) => setTimeout(r, options.simulateDelayMs));
          }

          // Simulate error
          if (options.simulateError) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
              status: 'error',
              code: options.simulateError.code,
              message: options.simulateError.message,
              retryable: options.simulateError.retryable,
            }));
            return;
          }

          // Success response
          const handler = options.onExecute ?? (() => ({
            output: { result: 'dummy-output', processedAt: new Date().toISOString() },
          }));

          const result = handler(body);

          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            status: 'success',
            output: result.output,
            execution_time_ms: 50,
            memory_writes: result.memoryWrites,
          }));
        });
        return;
      }

      res.writeHead(404);
      res.end('Not found');
    });

    server.listen(0, '127.0.0.1', () => {
      const addr = server.address() as { port: number };
      const agent: DummyAgent = {
        url: `http://127.0.0.1:${addr.port}`,
        port: addr.port,
        server,
        close: () => new Promise((r) => server.close(() => r())),
        get callCount() { return callCount; },
        get lastRequest() { return lastRequest; },
      };
      resolve(agent);
    });
  });
}
