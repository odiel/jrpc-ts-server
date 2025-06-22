import { Json, JsonObject } from './generic.ts';

declare const __brand: unique symbol;
type Brand<B> = { [__brand]: B };
export type Branded<T, B> = T & Brand<B>;

export type ProtocolVersion = Branded<string, 'ProtocolVersion'>;
export const ProtocolVersions = {
    v1: 'v1' as ProtocolVersion,
};
export type ApiVersion = Branded<string, 'ApiVersion'>;
export type RequestId = Branded<string, 'RequestId'>;
export type ResourceName = Branded<string, 'ResourceName'>;
export type ResourceId = Branded<string, 'ResourceId'>;
export type ResourceReference = Branded<
    `${ResourceName}:${ResourceId}`,
    'ResourceReference'
>;

export type Resource = {
    _resource_id: ResourceId;
    _resource_name: string;
    [key: string]: unknown
};

export class OperationContext {
    public result: Resource | Resource[] | undefined;

    constructor(
        public readonly apiVersion: ApiVersion,
        public readonly operation: RequestOperation,
    ) {
    }
}

export class RequestContext {
    private globalContext: Record<string, unknown> = {};
    public operationContext: OperationContext | undefined;

    constructor(public requestContext: {
        settings?: ServerRequestSettings,
        authentication?: ServerRequestAuthentication
    }) {}

    public set(key: string, value: unknown) {
        this.globalContext[key] = value;
    }

    public get(key: string): undefined | unknown {
        return this.globalContext[key] ?? undefined;
    }
}

export abstract class ResourceHandler<R extends Resource> {
    constructor(public name: string, public apiVersion: string = 'v1') {
    }

    abstract fetch(
        properties?: R,
        context?: RequestContext,
    ): Promise<R | R[]>;
    abstract create(properties: R, context?: RequestContext): Promise<R>;
    abstract update(
        properties: R,
        returnProperties?: Json,
        context?: RequestContext,
    ): Promise<R>;
    abstract delete(where: unknown, context?: RequestContext): Promise<void>;
    abstract subscribe(properties?: R, context?: RequestContext): Promise<R>;
}

export type ProcedureInput = Branded<Json, 'ProcedureInput'>;
export type ProcedureOutput = Branded<Json, 'ProcedureOutput'>;

export abstract class ProcedureHandler<
    I extends ProcedureInput,
    O extends Resource,
> {
    constructor(public name: string, public apiVersion: string = 'v1') {
    }

    abstract execute(context: RequestContext, input?: I): Promise<O>;
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
        result: unknown;
    } | {
        error: ErrorResponse;
    });

export type ServerResponse = {
    jrpc: ProtocolVersion;
    api: ApiVersion;
    operations: ResponseResult[];
    resources: Record<ResourceReference, Resource>;
};

export type ServerResponseError = {
    version: ProtocolVersion;
    api: 'unknown';
    error: ErrorResponse;
};

export type RequestOperationBase = {
    id: RequestId;
    properties: Json;
    return?: string[];
};

export type RequestOperationCreate = {
    create: ResourceName;
};

export type RequestOperationUpdate = {
    update: ResourceName;
};

export type RequestOperationDelete = {
    delete: ResourceName;
    where: Json;
};

export type RequestOperationFetch = {
    fetch: ResourceName;
};

export type RequestOperationSubscribe = {
    subscribe: ResourceName;
};

export type RequestOperationExecute = {
    execute: string;
};

export type RequestOperation =
    & RequestOperationBase
    & (
        | RequestOperationCreate
        | RequestOperationUpdate
        | RequestOperationDelete
        | RequestOperationFetch
        | RequestOperationSubscribe
        | RequestOperationExecute
    );

export type ServerRequestSettings =  {
    execution_strategy?: "sequential" | "parallel",
    operation_timeout?: number,
};

export type ServerRequestAuthentication =  {
    scheme: "bearer";
    token: string;
    token_format: "JWT"
};

export type ServerRequest = {
    jrpc: ProtocolVersion;
    api: ApiVersion;
    settings?: ServerRequestSettings;
    authentication?: ServerRequestAuthentication;
    operations: RequestOperation[];
    return?: { [key: string]: string[] };
};
