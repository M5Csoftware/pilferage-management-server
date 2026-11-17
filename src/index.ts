import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import dotenv from 'dotenv';
import { connectDatabase } from './config/database.js';
import { shipmentRoutes } from './routes/shipments.js';

dotenv.config();

const port = parseInt(process.env.PORT || '5000', 10);
const host = process.env.HOST || '0.0.0.0';

export async function buildApp() {
  const app = Fastify({
    logger: {
      transport:
        process.env.NODE_ENV !== 'production'
          ? {
              target: 'pino-pretty',
              options: {
                translateTime: 'HH:MM:ss Z',
                ignore: 'pid,hostname',
              },
            }
          : undefined,
    },
  });

  // Security headers & CORS
  await app.register(helmet, {
    contentSecurityPolicy: false,
  });

  await app.register(cors, {
    origin: process.env.CORS_ORIGIN || '*',
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  });

  // Swagger OpenAPI Docs
  await app.register(swagger, {
    openapi: {
      info: {
        title: 'PMS - Pilferage Management System API',
        description: 'Fastify & MongoDB REST API for tracking Inbound arrival weight vs Outbound dispatch weight to prevent cargo theft',
        version: '1.0.0',
      },
      servers: [
        {
          url: `http://localhost:${port}`,
          description: 'Local development server',
        },
      ],
    },
  });

  await app.register(swaggerUi, {
    routePrefix: '/docs',
    uiConfig: {
      docExpansion: 'list',
      deepLinking: false,
    },
  });

  // Health check endpoint (vital for Render health monitoring)
  app.get('/health', async () => {
    return {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      service: 'pilferage-management-server',
      version: '1.0.0',
    };
  });

  // Root welcome
  app.get('/', async () => {
    return {
      service: 'PMS (Pilferage Management System) API',
      documentation: '/docs',
      health: '/health',
      status: 'running',
    };
  });

  // Register API domain routes
  await app.register(shipmentRoutes, { prefix: '/api/shipments' });

  return app;
}

async function start() {
  try {
    await connectDatabase();
    const app = await buildApp();

    await app.listen({ port, host });
    console.log(`[PMS Server] Running at http://${host}:${port}`);
    console.log(`[Swagger Docs] Available at http://${host}:${port}/docs`);
    console.log(`[Health Endpoint] Available at http://${host}:${port}/health`);
  } catch (err) {
    console.error('Fatal error starting server:', err);
    process.exit(1);
  }
}

// Start if executed directly
if (process.argv[1]?.includes('index')) {
  start();
}
