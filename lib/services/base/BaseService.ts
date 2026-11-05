import { logger } from "@/lib/logger";

export abstract class BaseService {
  protected readonly name: string;

  constructor(name: string) {
    this.name = name;
  }

  protected logInfo(message: string, meta?: Record<string, unknown>): void {
    logger.info(`[${this.name}] ${message}`, meta);
  }

  protected logError(message: string, meta?: Record<string, unknown>): void {
    logger.error(`[${this.name}] ${message}`, meta);
  }
}
