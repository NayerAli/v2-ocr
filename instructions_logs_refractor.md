# Logging Refactor Instructions

## Objective
Refactor all logging in the codebase to avoid console over-spam, following best practices. The main goal is to:
- **Significantly reduce unnecessary log noise in production and build outputs**
- **Keep only essential logs for monitoring and debugging in production**
- **Preserve useful debug logs for development**
- **Ensure all logs are environment-aware and consistently managed**

## Step-by-Step Instructions

### 1. **Create a Centralized Logging Utility**
- Add a file (e.g., `lib/log.ts`) with named exports for logging:
  ```ts
  export function debugLog(...args: unknown[]) {
    if (process.env.NODE_ENV === 'development') console.log(...args)
  }
  export function debugError(...args: unknown[]) {
    if (process.env.NODE_ENV !== 'production') console.error(...args)
  }
  export function infoLog(...args: unknown[]) {
    if (process.env.NODE_ENV !== 'production') console.info(...args)
  }
  export function warnLog(...args: unknown[]) {
    if (process.env.NODE_ENV !== 'production') console.warn(...args)
  }
  export function prodLog(...args: unknown[]) {
    // For critical logs that must always be shown (e.g., fatal errors)
    console.log(...args)
  }
  ```
- Document usage in the file for clarity.

### 2. **Audit and Categorize All Logs**
- Search for all `console.log`, `console.error`, `console.info`, and `console.warn` usages in the codebase.
- For each log, decide if it is:
  - **Development-only** (debugging, state dumps, verbose info): use `debugLog`.
  - **Production-relevant** (errors, important warnings, critical info): use `prodLog` or `debugError`/`warnLog` as appropriate.
  - **Redundant or excessive**: consider removing or reducing frequency (e.g., log only on error, or with a random chance in dev).

### 3. **Replace and Refactor Logs**
- Replace all direct `console.*` calls with the appropriate utility function.
- For logs inside loops or frequently called code, ensure they do not spam the console (e.g., throttle, deduplicate, or summarize output).
- For logs that are only useful for debugging, ensure they are not shown in production or build output.
- For logs that are essential for monitoring or error tracking, ensure they are always shown or sent to a logging service.
- If you encounter edge cases (e.g., logs from third-party libraries, async errors, or logs that are difficult to categorize), use your best judgment to minimize console noise while preserving necessary information.

### 4. **Be Proactive and Thoughtful**
- Do not simply remove all logs or wrap everything blindly.
- Use your judgment to:
  - Keep logs that help diagnose real issues in production.
  - Remove or silence logs that add noise but no value.
  - Add missing logs if you find places where error handling is silent.
- If a log is ambiguous, prefer to keep it in development only.
- Always prioritize reducing console output, especially in production and build environments.

### 5. **Document Any Special Cases**
- If you encounter logs that require special handling (e.g., third-party libraries, async errors), document your approach in code comments.

## Best Practices
- Prefer concise, informative log messages.
- Avoid logging sensitive data.
- Use structured logs (objects) for complex data.
- Use log levels consistently.
- Review and refactor logs regularly as the codebase evolves.

## Final Note
**Proceed step by step, and do not skip or ignore any log.**
Be diligent and proactive: your goal is to make the logging system robust, maintainable, and—above all—reduce unnecessary console output in all environments. 