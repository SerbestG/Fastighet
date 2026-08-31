import { ZodError, type ZodTypeAny, type z } from 'zod';
import { AppError } from './errors.js';

/**
 * Validerar indata och översätter Zods felutdata till fältfel som gränssnittet
 * kan visa vid rätt fält.
 */
export function parse<T extends ZodTypeAny>(schema: T, value: unknown): z.infer<T> {
  try {
    return schema.parse(value);
  } catch (error) {
    if (error instanceof ZodError) {
      throw new AppError('validation_error', undefined, {
        issues: error.issues.map((issue) => ({
          path: issue.path.join('.') || '_',
          message: translateIssue(issue),
        })),
      });
    }
    throw error;
  }
}

function translateIssue(issue: z.ZodIssue): string {
  switch (issue.code) {
    case 'invalid_type':
      return issue.received === 'undefined' ? 'Fältet är obligatoriskt.' : 'Fältet har fel format.';
    case 'too_small':
      if (issue.type === 'string') return `Ange minst ${issue.minimum} tecken.`;
      if (issue.type === 'array') return `Välj minst ${issue.minimum}.`;
      return `Värdet är för litet (minst ${issue.minimum}).`;
    case 'too_big':
      if (issue.type === 'string') return `Högst ${issue.maximum} tecken.`;
      if (issue.type === 'array') return `Högst ${issue.maximum} poster.`;
      return `Värdet är för stort (högst ${issue.maximum}).`;
    case 'invalid_string':
      if (issue.validation === 'email') return 'Ange en giltig e-postadress.';
      if (issue.validation === 'url') return 'Ange en giltig webbadress.';
      if (issue.validation === 'uuid') return 'Ogiltig identifierare.';
      if (issue.validation === 'datetime') return 'Ange en giltig tidpunkt.';
      return 'Värdet har fel format.';
    case 'invalid_enum_value':
      return 'Välj ett av de tillåtna alternativen.';
    case 'unrecognized_keys':
      return 'Okända fält skickades med.';
    default:
      return 'Värdet kunde inte tolkas.';
  }
}
