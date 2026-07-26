/** API failure that should clear the session and send the operator to login. */
export class ApiUnauthorizedError extends Error {
  readonly status = 401 as const;

  constructor(message = "Unauthorized") {
    super(message);
    this.name = "ApiUnauthorizedError";
  }
}

/**
 * Authenticated but not permitted. Must preserve the session — never treat as logout.
 */
export class ApiForbiddenError extends Error {
  readonly status = 403 as const;

  constructor(message = "Forbidden") {
    super(message);
    this.name = "ApiForbiddenError";
  }
}
