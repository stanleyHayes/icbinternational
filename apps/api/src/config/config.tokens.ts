/**
 * Injection tokens for configuration.
 *
 * In their own file so that `config.service.ts` and `config.module.ts` can both import
 * the token without importing each other — a cycle Nest resolves as `undefined` at
 * runtime, producing a dependency error that looks nothing like its cause.
 */
export const ENVIRONMENT = Symbol('ENVIRONMENT');
