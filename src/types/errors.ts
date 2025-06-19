import {ErrorResponse} from "./resourceHandler.ts";

export enum ErrorCodes {
    GENERIC_ERROR = 'GENERIC_ERROR',
    PROCEDURE_NOT_FOUND = 'PROCEDURE_NOT_FOUND',
    RESOURCE_NOT_FOUND = 'RESOURCE_NOT_FOUND',
    UNHANDLED_ERROR = 'UNHANDLED_ERROR',
    UNEXPECTED_ERROR = 'UNEXPECTED_ERROR',
    UPGRADE_REQUEST_NOT_SUPPORTED = 'UPGRADE_REQUEST_NOT_SUPPORTED',
    REQUEST_METHOD_NOT_SUPPORTED = 'REQUEST_METHOD_NOT_SUPPORTED',
    EXPECTED_REQUEST_BODY_CONTENT = 'EXPECTED_REQUEST_BODY_CONTENT',
    INVALID_JSON_CONTENT = 'INVALID_JSON_CONTENT',
}

export class JRPCError extends Error {
    constructor(
        public errorCode: string,
        message: string,
        public options?: {
            details?: {
                error_name: string;
                error_message: string;
            },
            suggestions?: string | string[],
        }
    ) {
        super(message);
    }
}

export class UpgradeRequestNotSupported extends JRPCError {
    constructor() {
        super(ErrorCodes.UPGRADE_REQUEST_NOT_SUPPORTED, 'Unexpected error.', {
            suggestions: []
        });
    }
}

export class RequestMethodNotSupported extends JRPCError {
    constructor() {
        super(ErrorCodes.REQUEST_METHOD_NOT_SUPPORTED, 'The request method is not supported.', {
            suggestions: []
        });
    }
}

export class ExpectedRequestBodyContent extends JRPCError {
    constructor() {
        super(ErrorCodes.EXPECTED_REQUEST_BODY_CONTENT, 'The request must have a body.', {
            suggestions: []
        });
    }
}

export class InvalidJsonContent extends JRPCError {
    constructor() {
        super(ErrorCodes.INVALID_JSON_CONTENT, 'The request body is not a valid JSON.', {
            suggestions: []
        });
    }
}

export class ProcedureNotFound extends JRPCError {
    constructor() {
        super(ErrorCodes.PROCEDURE_NOT_FOUND, 'Procedure was not found.', {
            suggestions: [
                'ensure the procedure name is properly typed',
                'ensure the request is being made to the right API version',
            ]
        });
    }
}

export class ResourceNotFound extends JRPCError {
    constructor() {
        super(ErrorCodes.RESOURCE_NOT_FOUND, 'Resource was not found.', {
            suggestions: [
                'ensure the resource name is properly typed',
                'ensure the resource has been registered in the right API version',
            ]
        });
    }
}

export class UnhandledError extends JRPCError {
    constructor(details?: {error_name: string;
        error_message: string; }) {
        super(ErrorCodes.UNHANDLED_ERROR, 'An unhandled error occurred in the application layer.', {
            suggestions: [
                'ensure all errors in the application are captured and a custom error is provided as feedback',
            ],
            details
        });
    }
}

export function toErrorResponse(error: JRPCError): ErrorResponse {
    return {
        code: error.errorCode,
        message: error.message,
        suggestion: error.options?.suggestions,
        details: error.options?.details,
    }
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