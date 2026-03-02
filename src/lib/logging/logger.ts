type LogLevel = "trace" | "debug" | "info" | "warn" | "error" | "fatal";

const levels: Record<LogLevel, number> = {
  trace: 10,
  debug: 20,
  info: 30,
  warn: 40,
  error: 50,
  fatal: 60,
};

function getConfiguredLevel(): LogLevel {
  const env = (process.env.LOG_LEVEL ?? "info").toLowerCase();
  return (env in levels ? env : "info") as LogLevel;
}

function makeLogger(level: LogLevel) {
  const configuredLevel = getConfiguredLevel();

  function shouldLog(msgLevel: LogLevel): boolean {
    return levels[msgLevel] >= levels[configuredLevel];
  }

  function log(msgLevel: LogLevel, msgOrObj: unknown, msg?: string) {
    if (!shouldLog(msgLevel)) return;
    const entry: Record<string, unknown> = { level: msgLevel };
    if (typeof msgOrObj === "string") {
      entry.msg = msgOrObj;
    } else {
      Object.assign(entry, msgOrObj);
      if (msg) entry.msg = msg;
    }
    const method =
      msgLevel === "error" || msgLevel === "fatal"
        ? console.error
        : msgLevel === "warn"
          ? console.warn
          : console.log;
    method(JSON.stringify(entry));
  }

  return {
    level,
    trace: (obj: unknown, msg?: string) => log("trace", obj, msg),
    debug: (obj: unknown, msg?: string) => log("debug", obj, msg),
    info: (obj: unknown, msg?: string) => log("info", obj, msg),
    warn: (obj: unknown, msg?: string) => log("warn", obj, msg),
    error: (obj: unknown, msg?: string) => log("error", obj, msg),
    fatal: (obj: unknown, msg?: string) => log("fatal", obj, msg),
    child: (bindings: Record<string, unknown>) => {
      const child = makeLogger(level);
      const origLog = log;
      const bound =
        (msgLevel: LogLevel) => (obj: unknown, childMsg?: string) => {
          if (!shouldLog(msgLevel)) return;
          const entry: Record<string, unknown> = {
            level: msgLevel,
            ...bindings,
          };
          if (typeof obj === "string") {
            entry.msg = obj;
          } else {
            Object.assign(entry, obj);
            if (childMsg) entry.msg = childMsg;
          }
          const method =
            msgLevel === "error" || msgLevel === "fatal"
              ? console.error
              : msgLevel === "warn"
                ? console.warn
                : console.log;
          method(JSON.stringify(entry));
        };
      child.trace = bound("trace");
      child.debug = bound("debug");
      child.info = bound("info");
      child.warn = bound("warn");
      child.error = bound("error");
      child.fatal = bound("fatal");
      void origLog; // suppress unused warning
      return child;
    },
  };
}

export const logger = makeLogger(getConfiguredLevel());
