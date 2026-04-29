import app from './app.js';
import { createServer } from 'http';
import { config } from './config/env.js';
import logger from './utils/logger.js';

const PORT = config.PORT || 5000;

const server = createServer(app);

server.listen(PORT, () => {
    logger.info(`
    ╔══════════════════════════════════════════╗
    ║     STAGES OF WAR - SERVER RUNNING       ║
    ╠══════════════════════════════════════════╣
    ║  Mode: ${config.NODE_ENV.padEnd(20)} ║
    ║  Port: ${String(PORT).padEnd(20)} ║
    ║  URL: http://localhost:${String(PORT).padEnd(15)} ║
    ║  Admin: /admin                           ║
    ╚══════════════════════════════════════════╝
    `);
});

// Graceful shutdown
process.on('SIGTERM', () => {
    logger.info('SIGTERM received. Shutting down gracefully...');
    server.close(() => {
        logger.info('Process terminated!');
    });
});

process.on('unhandledRejection', (err) => {
    logger.error('Unhandled Rejection:', err);
});

process.on('uncaughtException', (err) => {
    logger.error('Uncaught Exception:', err);
    process.exit(1);
});