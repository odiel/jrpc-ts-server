import { ErrorResponse } from './resource_handler.ts';

export enum ErrorCodes {
    UPGRADE_REQUEST_NOT_SUPPORTED = 'JRPC_UPGRADE_REQUEST_NOT_SUPPORTED',
    REQUEST_METHOD_NOT_SUPPORTED = 'JRPC_REQUEST_METHOD_NOT_SUPPORTED',
    EXPECTED_REQUEST_BODY_CONTENT = 'JRPC_EXPECTED_REQUEST_BODY_CONTENT',
    INVALID_JSON_CONTENT = 'JRPC_INVALID_JSON_CONTENT',

    PROCEDURE_NOT_FOUND = 'JRPC_PROCEDURE_NOT_FOUND',
    RESOURCE_NOT_FOUND = 'JRPC_RESOURCE_NOT_FOUND',
    UNHANDLED_ERROR = 'JRPC_UNHANDLED_ERROR',

    NOT_AUTHENTICATED = 'JRPC_NOT_AUTHENTICATED',
    NOT_AUTHORIZED = 'JRPC_NOT_AUTHORIZED',
}

export class JRPCError extends Error {
    constructor(
        public code: string,
        message: string,
        public options?: {
            details?: {
                error_name: string;
                error_message: string;
            };
            suggestions?: string | string[];
        },
    ) {
        super(message);
    }
}

export class UpgradeRequestNotSupported extends JRPCError {
    constructor() {
        super(ErrorCodes.UPGRADE_REQUEST_NOT_SUPPORTED, 'Upgrade request not supported.', {
            suggestions: [],
        });
    }
}

export class RequestMethodNotSupported extends JRPCError {
    constructor() {
        super(
            ErrorCodes.REQUEST_METHOD_NOT_SUPPORTED,
            'The request method is not supported.',
            {
                suggestions: [],
            },
        );
    }
}

export class ExpectedRequestBodyContent extends JRPCError {
    constructor() {
        super(
            ErrorCodes.EXPECTED_REQUEST_BODY_CONTENT,
            'The request must have a body.',
            {
                suggestions: [],
            },
        );
    }
}

export class InvalidJsonContent extends JRPCError {
    constructor() {
        super(
            ErrorCodes.INVALID_JSON_CONTENT,
            'The request body content must be a valid JSON.',
            {
                suggestions: [],
            },
        );
    }
}

export class ProcedureNotFound extends JRPCError {
    constructor() {
        super(ErrorCodes.PROCEDURE_NOT_FOUND, 'Procedure not found.', {
            suggestions: [],
        });
    }
}

export class ResourceNotFound extends JRPCError {
    constructor() {
        super(ErrorCodes.RESOURCE_NOT_FOUND, 'Resource not found.', {
            suggestions: [],
        });
    }
}

export class OperationTypeNotSupported extends JRPCError {
    constructor() {
        super(ErrorCodes.RESOURCE_NOT_FOUND, 'Operation type not supported.', {
            suggestions: [
                'Use `execute` for procedures',
                'Use `subscribe` or `create` or `update` or `fetch` or  `delete` for resources.'
            ],
        });
    }
}

export class UnhandledError extends JRPCError {
    constructor(e: Error) {
        super(
            ErrorCodes.UNHANDLED_ERROR,
            'An unhandled error occurred.',
            {
                details: getErrorDetails(e),
            },
        );
    }
}

export class NotAuthenticatedError extends JRPCError {
    constructor() {
        super(
            ErrorCodes.NOT_AUTHENTICATED,
            'Not authenticated.',
        );
    }
}

export class NotAuthorizedError extends JRPCError {
    constructor() {
        super(
            ErrorCodes.NOT_AUTHORIZED,
            'Not authorized.',
        );
    }
}

export function toErrorResponse(error: JRPCError): ErrorResponse {
    return {
        code: error.code,
        message: error.message,
        suggestion: error.options?.suggestions,
        details: error.options?.details,
    };
}

export function getErrorDetails(e: Error): {
    error_name: string;
    error_message: string;
} {
    return {
        error_name: e.constructor.name,
        error_message: e.message,
    };
}
