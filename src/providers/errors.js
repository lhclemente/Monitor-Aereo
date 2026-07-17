export class ProviderError extends Error {
  constructor(code, message, options = {}) {
    super(message);
    this.name = 'ProviderError';
    this.code = code;
    this.retryable = Boolean(options.retryable);
    this.level = options.level || 'warn';
  }
}

export function normalizeProviderError(error) {
  if (error instanceof ProviderError) {
    return {
      code: error.code,
      message: error.message,
      retryable: error.retryable,
      level: error.level
    };
  }

  return {
    code: 'provider_error',
    message: error?.message || String(error),
    retryable: true,
    level: 'error'
  };
}
