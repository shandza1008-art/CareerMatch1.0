import 'dotenv/config';
import express from 'express';
import http from 'http';
import cookieParser from 'cookie-parser';
import path from 'path';
import fs from 'fs';
import { initDatabase } from './server/db.ts';
import { createApiRouter } from './server/routes.ts';

function resolveServerPort(): number {
  const portFlagIdx = process.argv.findIndex((arg) => arg === '--port' || arg === '-p');
  if (portFlagIdx !== -1 && process.argv[portFlagIdx + 1]) {
    const parsed = Number(process.argv[portFlagIdx + 1]);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  const eqFlag = process.argv.find((arg) => arg.startsWith('--port='));
  if (eqFlag) {
    const parsed = Number(eqFlag.split('=')[1]);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }

  const envPort = Number(process.env.PORT);
  const nginxPort = Number(process.env.NGINX_PORT);
  if (Number.isFinite(envPort) && envPort > 0 && envPort !== nginxPort) {
    return envPort;
  }

  const defaultAppPort = Number(process.env.DEFAULT_APP_PORT);
  if (Number.isFinite(defaultAppPort) && defaultAppPort > 0) {
    return defaultAppPort;
  }

  return 3000;
}

function resolveServerHost(): string {
  const hostFlagIdx = process.argv.findIndex((arg) => arg === '--host');
  if (hostFlagIdx !== -1 && process.argv[hostFlagIdx + 1]) {
    return process.argv[hostFlagIdx + 1];
  }
  const eqFlag = process.argv.find((arg) => arg.startsWith('--host='));
  if (eqFlag) {
    return eqFlag.split('=')[1] || '0.0.0.0';
  }
  return '0.0.0.0';
}

async function startServer() {
  initDatabase();

  const app = express();
  const httpServer = http.createServer(app);
  const PORT = resolveServerPort();
  const HOST = resolveServerHost();

  app.use(express.json({ limit: '5mb' }));
  app.use(express.urlencoded({ extended: true }));
  app.use(cookieParser());

  app.use('/api', createApiRouter());

  let viteServerInstance: { close: () => Promise<void> } | null = null;

  if (process.env.NODE_ENV !== 'production') {
    let viteMiddleware: express.RequestHandler | null = null;
    const viteReady = (async () => {
      const { createServer: createViteServer } = await import('vite');
      const vite = await createViteServer({
        server: {
          middlewareMode: true,
          hmr: process.env.DISABLE_HMR === 'true' ? false : { server: httpServer },
        },
        appType: 'spa',
      });
      viteServerInstance = vite;
      viteMiddleware = vite.middlewares;
    })();

    app.use(async (req, res, next) => {
      try {
        await viteReady;
        if (viteMiddleware) {
          return viteMiddleware(req, res, next);
        }
        next();
      } catch (err) {
        next(err);
      }
    });
  } else {
    const distDir = path.join(process.cwd(), 'dist');
    if (fs.existsSync(distDir)) {
      app.use(express.static(distDir));
      app.get('*', (_req, res) => {
        res.sendFile(path.join(distDir, 'index.html'));
      });
    }
  }

  await new Promise<void>((resolve, reject) => {
    httpServer.once('error', reject);
    httpServer.listen(PORT, HOST, () => {
      console.log(`CareerMatch server running on http://${HOST}:${PORT}`);
      resolve();
    });
  });

  const shutdown = async () => {
    try {
      if (viteServerInstance) await viteServerInstance.close();
    } catch {
      // ignore close errors
    }
    httpServer.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 500).unref();
  };

  process.once('SIGTERM', shutdown);
  process.once('SIGINT', shutdown);
}

startServer().catch((err) => {
  console.error('Failed to start CareerMatch server:', err);
  process.exit(1);
});
