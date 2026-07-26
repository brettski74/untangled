/**
 * User-facing copy for React Router route error Responses.
 * Keeps ErrorBoundary mapping testable without rendering HTML.
 */
export type RouteErrorCopy = {
  message: string;
  details: string;
};

const UNEXPECTED_DETAILS = "An unexpected error occurred.";
const GENERIC_HTTP_DETAILS = "Request could not be completed.";

/**
 * Map an HTTP route-error status (+ optional statusText) to display copy.
 */
export function route_error_copy(
  status: number,
  statusText: string | undefined | null,
): RouteErrorCopy {
  if (status === 404) {
    return {
      message: "404",
      details: "The requested page could not be found.",
    };
  }
  if (status === 403) {
    return {
      message: "403",
      details: "Access is denied.",
    };
  }

  const trimmed = statusText?.trim() ?? "";
  return {
    message: String(status),
    details: trimmed.length > 0 ? trimmed : GENERIC_HTTP_DETAILS,
  };
}

export function unexpected_error_copy(): RouteErrorCopy {
  return {
    message: "Oops!",
    details: UNEXPECTED_DETAILS,
  };
}
