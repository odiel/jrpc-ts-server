import { JSONSchema } from './json_schema.ts';

declare const __brand: unique symbol;
type Brand<B> = { [__brand]: B };
export type Branded<T, B> = T & Brand<B>;

export enum HttpMethod {
    GET = 'GET',
    POST = 'POST',
}

export enum Environment {
    DEV = 'development',
    STAGING = 'staging',
    PROD = 'production',
}

export enum LogLevel {
    DEBUG = 0,
    INFO = 1,
    WARNING = 2,
    ERROR = 3,
}

export type ProtocolVersion = Branded<string, 'ProtocolVersion'>;
export type ApiVersion = Branded<string, 'ApiVersion'>;
export type OperationId = Branded<string, 'OperationId'>;
export type ProcedureName = Branded<string, 'ProcedureName'>;
export type SubscriptionTopic = Branded<string, 'SubscriptionTopic'>;
export type ResourceName = Branded<string, 'ResourceName'>;
export type ResourceId = Branded<string, 'ResourceId'>;
export type ResourceReference = Branded<
    `${ResourceName}/${ResourceId}`,
    'ResourceReference'
>;
export type ServerWebSocketId = Branded<string, 'WebSocketId'>;

export const ProtocolVersions = {
    v1: 'v1' as ProtocolVersion,
};

export type RequestContext = {
    authentication?: ServerRequestAuthentication;
    executionStrategy?: 'sequential' | 'parallel';
    operationTimeout?: number;
};

export type ProcedureInput = {
    [key: string]: unknown;
};

export type Resource = {
    _resource_id: ResourceId;
    _resource_name: ResourceName;
    [key: string]: unknown;
};

export type OperationBase = {
    id: OperationId;
    return?: string[];
};

export type ProcedureOperation = OperationBase & {
    type: 'execute';
    procedure: ProcedureName;
    input: Resource;
};

export type SubscriptionOperation = OperationBase & {
    type: 'subscribe';
    topic: SubscriptionTopic;
};

export type OperationOutput =
    | Record<ResourceReference, Resource | null>
    | undefined;

export type Operation = ProcedureOperation | SubscriptionOperation;

export type OperationContext = {
    api: ApiVersion;
    operation: Operation;
    result: OperationOutput;
};

export type OperationResults =
    & { id: OperationId }
    & ({
    results: ResourceReference | ResourceReference[] | null;
} | {
    error: ErrorResponse;
});


//
// export type OperationWhere = {
//     id: string;
//     [key: string]: number | number[] | string | string[] | { equal: string } | {
//         match: string;
//     } | {
//         gt: number | string;
//         inclusive: boolean;
//     } | { lt: number | string; inclusive: boolean };
// };
//


// todo: redefine the input and output types
export interface ProcedureHandlerInterface {
    name: ProcedureName;
    api: ApiVersion;
    input: JSONSchema | undefined;
    output: JSONSchema | undefined;

    execute(
        args: {
            operationContext: OperationContext;
            context: RequestContext;
            input?: ProcedureInput;
        },
    ): Promise<OperationOutput>;
}

export interface SubscriptionHandlerInterface {
    topic: SubscriptionTopic;
    api: ApiVersion;

    registerSocketConnection(
        socket: ServerWebSocket,
        context: RequestContext,
        operationContext: OperationContext,
    ): void;

    publishMessage(
        event: SubscriptionEvent,
    ): void;

    onSocketDisconnected(id: ServerWebSocketId): void;
}

export type ServerRequestSettings = {
    execution_strategy?: 'sequential' | 'parallel';
    operation_timeout?: number;
};

export type ServerRequestAuthentication = {
    scheme: 'bearer';
    token: string;
    token_format: 'JWT';
};

export type ServerRequest = {
    jrpc: ProtocolVersion;
    api: ApiVersion;
    settings?: ServerRequestSettings;
    authentication?: ServerRequestAuthentication;
    operations: Operation[];
    return?: { [key: string]: string[] };
};

export type ServerResponse = {
    jrpc: ProtocolVersion;
    api: ApiVersion;
    operations: OperationResults[];
    resources: Record<ResourceReference, Resource | null>;
};

export type ErrorResponse = {
    code: string;
    message: string;
    suggestion?: string | string[];
    details?: {
        error_name: string;
        error_message: string;
    };
};

export type ServerResponseError = {
    jrpc: ProtocolVersion;
    api: 'unknown';
    error: ErrorResponse;
};

export type ServerWebSocket = WebSocket & { id: ServerWebSocketId };
export type SubscriptionEvent = { timestamp: number; content: unknown };
