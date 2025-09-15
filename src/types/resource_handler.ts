import {
    ApiVersion,
    ProcedureName,
    ProtocolVersion,
    RequestId,
    ResourceId,
    ResourceName,
    ResourceReference,
    ServerWebSocket,
} from './common.ts';
import { JSONSchema } from './json_schema.ts';

export type Resource = {
    _resource_id: ResourceId;
    _resource_name: ResourceName;
    [key: string]: unknown;
};

export type OperationResult =
    | Record<ResourceReference, Resource | null>
    | undefined;

export class OperationContext {
    public result: OperationResult;

    constructor(
        public readonly apiVersion: ApiVersion,
        public readonly operation: RequestOperation,
    ) {
    }
}

export type RequestContext = {
    operationContext: OperationContext | undefined;
    authentication?: ServerRequestAuthentication;
    executionStrategy?: 'sequential' | 'parallel';
    operationTimeout?: number;
};

export interface ResourceHandlerInterface<R extends Resource> {
    resourceName: ResourceName;
    apiVersion: ApiVersion;
    resourceSchema: JSONSchema;

    create(
        props: { context: RequestContext; resource: Partial<Resource> },
    ): Promise<OperationResult>;

    fetch(
        props: {
            context: RequestContext;
            resource?: Partial<R>;
            where?: OperationWhere;
        },
    ): Promise<OperationResult>;

    update(
        props: {
            context: RequestContext;
            resource: Partial<R>;
            where?: OperationWhere;
        },
    ): Promise<OperationResult>;

    delete(
        props: { context: RequestContext; where?: OperationWhere },
    ): Promise<OperationResult>;

    subscribe(
        props: {
            context: RequestContext;
            socket: ServerWebSocket;
            where?: OperationWhere;
        },
    ): void;

    publishChange(
        operationType: OperationTypesForSubscriptions,
        resource: R,
    ): Promise<void>;

    onChange(
        operationType: OperationTypesForSubscriptions,
        resource: R,
    ): Promise<void>;
}

// todo: redefine the input and output types
export interface ProcedureInterface<I extends Resource, O extends Resource> {
    procedureName: ProcedureName;
    apiVersion: ApiVersion;
    inputSchema: JSONSchema | undefined;
    outputSchema: JSONSchema | undefined;

    execute(
        args: { context: RequestContext; properties?: I },
    ): Promise<OperationResult>;
}

export type ErrorResponse = {
    code: string;
    message: string;
    suggestion?: string | string[];
    details?: {
        error_name: string;
        error_message: string;
    };
};

export type ResponseResult =
    & { id: RequestId }
    & ({
        results: ResourceReference | ResourceReference[] | null;
    } | {
        error: ErrorResponse;
    });

export type ServerResponse = {
    jrpc: ProtocolVersion;
    api: ApiVersion;
    operations: ResponseResult[];
    resources: Record<ResourceReference, Resource | null>;
};

export type ServerResponseError = {
    version: ProtocolVersion;
    api: 'unknown';
    error: ErrorResponse;
};

export type RequestOperationBase = {
    id: RequestId;
    return?: string[];
};

export type OperationWhere = {
    id: string;
    [key: string]: number | number[] | string | string[] | { equal: string } | { match: string } | {
        gt: number | string;
        inclusive: boolean;
    } | { lt: number | string; inclusive: boolean };
};

export enum OperationTypes {
    CREATE = 'create',
    UPDATE = 'update',
    DELETE = 'delete',
    FETCH = 'fetch',
    SUBSCRIBE = 'subscribe',
}

export type OperationTypesForSubscriptions =
    | OperationTypes.CREATE
    | OperationTypes.UPDATE
    | OperationTypes.DELETE;

export type ResourceOperation =
    & RequestOperationBase
    & {
        resource: ResourceName;
        properties: Resource;
    }
    & ({
        type: OperationTypes.CREATE;
    } | {
        type:
            | OperationTypes.UPDATE
            | OperationTypes.DELETE
            | OperationTypes.FETCH
            | OperationTypes.SUBSCRIBE;
        where?: OperationWhere;
    });

export type ProcedureOperation = RequestOperationBase & {
    type: 'execute';
    procedure: string;
    properties: Resource;
};

export type RequestOperation = ResourceOperation | ProcedureOperation;

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
    operations: RequestOperation[];
    return?: { [key: string]: string[] };
};
