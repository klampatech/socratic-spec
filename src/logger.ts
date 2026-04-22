// Simple logger for spec synthesis operations

export const log = (message: string, ...args: unknown[]): void => {
  console.log(`[INFO] ${message}`, ...args);
};

export const error = (message: string, ...args: unknown[]): void => {
  console.error(`[ERROR] ${message}`, ...args);
};

export const warn = (message: string, ...args: unknown[]): void => {
  console.warn(`[WARN] ${message}`, ...args);
};
