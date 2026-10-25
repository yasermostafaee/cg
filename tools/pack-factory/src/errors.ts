import type { ZodError } from 'zod';

export class PackFactoryError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'PackFactoryError';
  }
}

export function zodMessage(label: string, error: ZodError): string {
  const details = error.issues
    .map(
      (issue) => `${issue.path.length === 0 ? '<root>' : issue.path.join('.')}: ${issue.message}`,
    )
    .join('\n');
  return `${label} is invalid:\n${details}`;
}
