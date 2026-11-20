import type { ErrorBody, ErrorCode } from "@ai/contracts";

/** A failed AI service call, with the service's safe-to-show message (AI_API_SPEC.md §1.3). */
export class AiApiError extends Error {
  readonly code: ErrorCode | "network_error";
  readonly status: number;
  readonly retryable: boolean;
  readonly requestId: string | null;
  readonly backendEndpointIds: string[];
  readonly details: ErrorBody["details"];

  constructor(
    code: ErrorCode | "network_error",
    message: string,
    options: {
      status?: number;
      retryable?: boolean;
      requestId?: string | null;
      backendEndpointIds?: string[];
      details?: ErrorBody["details"];
    } = {},
  ) {
    super(message);
    this.name = "AiApiError";
    this.code = code;
    this.status = options.status ?? 0;
    this.retryable = options.retryable ?? false;
    this.requestId = options.requestId ?? null;
    this.backendEndpointIds = options.backendEndpointIds ?? [];
    this.details = options.details;
  }

  static fromBody(body: ErrorBody, status: number): AiApiError {
    return new AiApiError(body.code, body.message, {
      status,
      retryable: body.retryable,
      requestId: body.request_id,
      backendEndpointIds: body.backend_endpoint_ids ?? [],
      details: body.details,
    });
  }
}

/** User-facing description of an error (never raw technical detail). */
export function describeAiError(error: unknown): { title: string; message: string; retryable: boolean } {
  if (!(error instanceof AiApiError)) {
    return { title: "Something went wrong", message: "Please try again.", retryable: true };
  }
  switch (error.code) {
    case "network_error":
      return { title: "AI service unreachable", message: error.message, retryable: true };
    case "unauthenticated":
      return { title: "Please sign in again", message: error.message, retryable: false };
    case "forbidden":
    case "entitlement_required":
      return { title: "Not available to you", message: error.message, retryable: false };
    case "backend_dependency_unconfirmed":
      return {
        title: "Not connected yet",
        message:
          error.message +
          (error.backendEndpointIds.length ? ` (waiting for ${error.backendEndpointIds.join(", ")})` : ""),
        retryable: false,
      };
    case "not_found":
      return { title: "Not found", message: error.message, retryable: false };
    default:
      return { title: "The AI request did not complete", message: error.message, retryable: error.retryable };
  }
}
