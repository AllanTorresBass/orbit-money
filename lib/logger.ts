type LogLevel = "debug" | "info" | "warn" | "error";

function emit(level: LogLevel, message: string, meta?: Record<string, unknown>): void {
  const payload = {
    level,
    message,
    time: new Date().toISOString(),
    ...(meta ?? {}),
  };
  const line = JSON.stringify(payload);
  if (level === "error") {
    process.stderr.write(`${line}\n`);
    return;
  }
  process.stdout.write(`${line}\n`);
}

export const logger = {
  debug(message: string, meta?: Record<string, unknown>): void {
    if (process.env.NODE_ENV === "production") {
      return;
    }
    emit("debug", message, meta);
  },
  info(message: string, meta?: Record<string, unknown>): void {
    emit("info", message, meta);
  },
  warn(message: string, meta?: Record<string, unknown>): void {
    emit("warn", message, meta);
  },
  error(message: string, meta?: Record<string, unknown>): void {
    emit("error", message, meta);
  },
};
