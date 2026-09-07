import pino from 'pino';
import { config } from './index.js';

// Pino logger configuration
const logger = pino({
  level: config.app.isProduction ? 'info' : 'debug',
  transport: config.app.isProduction
    ? {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:standard',
          ignore: 'pid,hostname'
        }
      }
    : {
        target: 'pino/file',
        options: {
          destination: 1 // stdout
        }
      },
  formatters: {
    level: (label) => ({ level: label.toUpperCase() }),
  },
  timestamp: pino.stdTimeFunctions.isoTime,
});

// Create child loggers for different modules
export const botLogger = logger.child({ module: 'bot' });
export const dbLogger = logger.child({ module: 'database' });
export const redisLogger = logger.child({ module: 'redis' });
export const jobLogger = logger.child({ module: 'jobs' });
export const handlerLogger = logger.child({ module: 'handlers' });
export const middlewareLogger = logger.child({ module: 'middlewares' });

export default logger;
