type RuntimeRole = 'backend' | 'worker' | 'scheduler';

const serializeError = (error: unknown) => {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
  }

  return {
    message: String(error),
  };
};

export const logRuntimeEvent = (
  role: RuntimeRole,
  event: string,
  details: Record<string, unknown> = {}
) => {
  console.log(
    JSON.stringify({
      ts: new Date().toISOString(),
      role,
      event,
      ...details,
    })
  );
};

export const logRuntimeError = (
  role: RuntimeRole,
  event: string,
  error: unknown,
  details: Record<string, unknown> = {}
) => {
  console.error(
    JSON.stringify({
      ts: new Date().toISOString(),
      role,
      event,
      ...details,
      error: serializeError(error),
    })
  );
};
