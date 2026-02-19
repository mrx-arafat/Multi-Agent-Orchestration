/**
 * Dummy agent HTTP server for integration testing.
 * Implements SRS FR-6.1 agent communication protocol:
 * - POST /orchestration/execute — execute a stage
 * - GET /health — health check endpoint
 *
 * Runs on a random available port during tests.
 * Phase 2: Enhanced with failFirstN for retry/fallback testing and request recording.
 */
import http from 'http';

export interface DummyAgentOptions {
  onExecute?: (body: unknown) => { output: Record<string, unknown>; memoryWrites?: Record<string, unknown> };
  healthStatus?: string;
  simulateError?: { code: string; message: string; retryable: boolean };
  simulateDelayMs?: number;
  /** Number of calls that fail before succeeding (for retry testing). */
  failFirstN?: number;
  /** Custom fail error for failFirstN mode. */
  failFirstNError?: { code: string; message: string; retryable: boolean };
}

export interface RecordedRequest {
  body: unknown;
  headers: Record<string, string | string[] | undefined>;
  timestamp: Date;
}

export interface DummyAgent {
  url: string;
  port: number;
  server: http.Server;
  close: () => Promise<void>;
  callCount: number;
  lastRequest: unknown;
  /** All recorded requests (Phase 2). */
  requests: RecordedRequest[];
  /** Update options at runtime (e.g., switch from failing to succeeding). */
  updateOptions: (newOptions: Partial<DummyAgentOptions>) => void;
}

export function createDummyAgent(options: DummyAgentOptions = {}): Promise<DummyAgent> {
  return new Promise((resolve) => {
    let callCount = 0;
    let lastRequest: unknown = null;
    const requests: RecordedRequest[] = [];
    let currentOptions = { ...options };

    const server = http.createServer(async (req, res) => {
      const url = req.url ?? '';

      // Health endpoint
      if (req.method === 'GET' && url === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          status: currentOptions.healthStatus ?? 'healthy',
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

          // Record request for test assertions
          requests.push({
            body,
            headers: req.headers as Record<string, string | string[] | undefined>,
            timestamp: new Date(),
          });

          // Simulate delay
          if (currentOptions.simulateDelayMs) {
            await new Promise((r) => setTimeout(r, currentOptions.simulateDelayMs));
          }

          // failFirstN: fail the first N calls, then succeed
          if (currentOptions.failFirstN && callCount <= currentOptions.failFirstN) {
            const err = currentOptions.failFirstNError ?? {
              code: 'AGENT_TRANSIENT_ERROR',
              message: `Simulated transient failure (call ${callCount}/${currentOptions.failFirstN})`,
              retryable: true,
            };
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
              status: 'error',
              code: err.code,
              message: err.message,
              retryable: err.retryable,
            }));
            return;
          }

          // Permanent simulate error
          if (currentOptions.simulateError) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
              status: 'error',
              code: currentOptions.simulateError.code,
              message: currentOptions.simulateError.message,
              retryable: currentOptions.simulateError.retryable,
            }));
            return;
          }

          // Success response
          const handler = currentOptions.onExecute ?? (() => ({
            output: { result: 'dummy-output', processedAt: new Date().toISOString() } as Record<string, unknown>,
            memoryWrites: undefined as Record<string, unknown> | undefined,
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
        requests,
        updateOptions: (newOpts) => {
          currentOptions = { ...currentOptions, ...newOpts };
        },
      };
      resolve(agent);
    });
  });
}
