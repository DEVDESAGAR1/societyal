/**
 * SocietyFix AI — Production Full-Stack Server Entry Point
 * Implements Express modular monolith API with Vite development middleware mounting,
 * structured Cloud Logging, health and readiness probes, and graceful termination.
 */

import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { logger } from './src/infrastructure/logger.ts';
import { checkDatabaseHealth, closeDatabasePool } from './src/db/client.ts';
import authRoutes from './src/routes/authRoutes.ts';
import societyRoutes from './src/routes/societyRoutes.ts';
import aiRoutes from './src/routes/aiRoutes.ts';
import meetingRoutes from './src/routes/meetingRoutes.ts';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = parseInt(process.env.PORT || '3000', 10);
const isProduction = process.env.NODE_ENV === 'production';
const commitSha = process.env.GIT_COMMIT_SHA || process.env.K_REVISION || 'm5-local-dev';
const startTime = Date.now();

// Body parsers
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Structured HTTP Request Logging Middleware (GCP Cloud Logging Format)
app.use((req: Request, res: Response, next: NextFunction) => {
  const start = Date.now();
  const traceHeader = req.header('X-Cloud-Trace-Context');
  let trace = '';
  let spanId = '';

  if (traceHeader) {
    const parts = traceHeader.split('/');
    trace = parts[0] || '';
    spanId = parts[1]?.split(';')[0] || '';
  }

  res.on('finish', () => {
    const latencyMs = Date.now() - start;
    // Do not log noisy health probes in high-volume logging unless they fail
    if (req.path === '/api/health' && res.statusCode === 200) {
      return;
    }

    logger.info(`${req.method} ${req.originalUrl} - ${res.statusCode} (${latencyMs}ms)`, {
      trace,
      spanId,
      httpRequest: {
        requestMethod: req.method,
        requestUrl: req.originalUrl,
        status: res.statusCode,
        userAgent: req.header('user-agent'),
        remoteIp: req.ip || req.socket.remoteAddress,
        latency: `${latencyMs / 1000}s`,
        protocol: req.protocol,
      },
    });
  });

  next();
});

// ==========================================
// Operational & Health Endpoints
// ==========================================

/**
 * Liveness & Health Probe
 * Used by Cloud Run and Cloud Load Balancing to verify container status.
 */
app.get('/api/health', async (_req: Request, res: Response) => {
  const dbHealth = await checkDatabaseHealth();
  const uptimeSeconds = Math.floor((Date.now() - startTime) / 1000);
  const memoryUsage = process.memoryUsage();

  const isHealthy = dbHealth.status !== 'UNHEALTHY';
  const statusCode = isHealthy ? 200 : 503;

  return res.status(statusCode).json({
    status: isHealthy ? 'HEALTHY' : 'DEGRADED',
    timestamp: new Date().toISOString(),
    uptimeSeconds,
    version: {
      milestone: 'M5',
      commitSha,
      nodeVersion: process.version,
    },
    system: {
      env: process.env.NODE_ENV || 'development',
      memory: {
        rssMb: Math.round(memoryUsage.rss / 1024 / 1024),
        heapUsedMb: Math.round(memoryUsage.heapUsed / 1024 / 1024),
        heapTotalMb: Math.round(memoryUsage.heapTotal / 1024 / 1024),
      },
    },
    services: {
      database: dbHealth,
      storage: { status: 'CONFIGURED', bucket: process.env.GCS_DOCUMENTS_BUCKET || 'default' },
      tasks: { status: 'CONFIGURED', queue: process.env.CLOUD_TASKS_QUEUE_NAME || 'default' },
    },
  });
});

/**
 * Readiness Probe
 * Verifies if container is ready to accept inbound user traffic.
 */
app.get('/api/ready', (_req: Request, res: Response) => {
  return res.status(200).json({ ready: true, milestone: 'M5' });
});

// Mount Authentication & Platform Administration API Routes
app.use('/api', authRoutes);

// Mount Housing Society, Membership & RBAC API Routes (Milestone M3)
app.use('/api', societyRoutes);

// Mount AI Gateway & Society Memory API Routes (Milestone M4)
app.use('/api', aiRoutes);

// Mount Meeting Capture & Minutes of Meeting API Routes (Milestone M5)
app.use('/api', meetingRoutes);

/**
 * System Version & Release Manifest
 */
app.get('/api/version', (_req: Request, res: Response) => {
  return res.status(200).json({
    name: 'SocietyFix AI',
    milestone: 'M5',
    description: 'Meeting Capture & Minutes of Meeting (MoM) — Structured capture, AI draft synthesis, and managing committee approval',
    commitSha,
    environment: process.env.NODE_ENV || 'development',
  });
});

// ==========================================
// Frontend Serving & Dev Middleware
// ==========================================
async function startServer() {
  if (!isProduction) {
    // Development mode: Mount Vite middleware on Express
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
    logger.info('Vite development middleware mounted on Express.');
  } else {
    // Production mode: Serve static assets from dist
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath, { maxAge: '1h', index: false }));

    // SPA fallback: any non-API route serves index.html
    app.get('*', (req: Request, res: Response, next: NextFunction) => {
      if (req.path.startsWith('/api')) {
        return next();
      }
      res.sendFile(path.resolve(distPath, 'index.html'));
    });
    logger.info('Static production asset handler configured from dist.');
  }

  const server = app.listen(port, '0.0.0.0', () => {
    logger.info(`SocietyFix AI server running on http://0.0.0.0:${port} [${process.env.NODE_ENV || 'development'}]`);
  });

  // Graceful shutdown handling for Cloud Run container lifecycle
  const handleShutdown = async (signal: string) => {
    logger.info(`Received ${signal}. Starting graceful shutdown...`);
    server.close(async () => {
      logger.info('HTTP server closed. Cleaning up resources...');
      await closeDatabasePool();
      logger.info('Graceful shutdown complete. Exiting process.');
      process.exit(0);
    });

    // Hard timeout fallback if connections fail to drain
    setTimeout(() => {
      logger.error('Graceful shutdown timeout exceeded. Forcefully killing process.');
      process.exit(1);
    }, 10000);
  };

  process.on('SIGTERM', () => handleShutdown('SIGTERM'));
  process.on('SIGINT', () => handleShutdown('SIGINT'));

  return server;
}

// Auto-start server unless running in test suite
if (process.env.NODE_ENV !== 'test') {
  startServer().catch((err) => {
    logger.critical('Fatal error during server startup', {
      error: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
    });
    process.exit(1);
  });
}

export { app, startServer };
export default app;
