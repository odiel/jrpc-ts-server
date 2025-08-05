import {
    ApiVersion,
    ResourceId,
    ResourceReference,
    ServerWebSocket,
    ProtocolVersion,
    ResourceName,
    RequestId
} from './common.ts';

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

export class RequestContext {
    private globalContext: Record<string, unknown> = {};
    public operationContext: OperationContext | undefined;

    constructor(
        public requestContext: {
            settings?: ServerRequestSettings;
            authentication?: ServerRequestAuthentication;
        },
    ) {}

    public set(key: string, value: unknown) {
        this.globalContext[key] = value;
    }

    public get(key: string): undefined | unknown {
        return this.globalContext[key] ?? undefined;
    }
}

export abstract class ResourceHandler<R extends Resource> {
    protected subscriptions: {
        context: RequestContext;
        socket: ServerWebSocket;
        where?: OperationWhere;
    }[];

    constructor(
        public name: ResourceName,
        public apiVersion: string = 'v1',
    ) {
        this.subscriptions = [];
    }

    abstract create(
        props: { context: RequestContext; resource: Partial<R> },
    ): Promise<OperationResult>;

    abstract fetch(
        props: {
            context: RequestContext;
            resource?: Partial<R>;
            where?: OperationWhere;
        },
    ): Promise<OperationResult>;

    abstract update(
        props: {
            context: RequestContext;
            resource: Partial<R>;
            where?: OperationWhere;
        },
    ): Promise<OperationResult>;

    abstract delete(
        props: { context: RequestContext; where?: OperationWhere },
    ): Promise<OperationResult>;

    public subscribe(
        props: {
            context: RequestContext;
            socket: ServerWebSocket;
            where?: OperationWhere;
        },
    ): void {
        this.subscriptions.push(props);
    }

    abstract publishChange(
        operationType: OperationTypesForSubscriptions,
        resource: R,
    ): Promise<void>;

    abstract onChange(
        operationType: OperationTypesForSubscriptions,
        resource: R,
    ): Promise<void>;
}

export abstract class ProcedureHandler<
    R extends Resource,
> {
    constructor(public name: string, public apiVersion: string = 'v1') {
    }

    abstract execute(
        args: { context: RequestContext; resource?: R },
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
    resources: Record<ResourceReference, Resource>;
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
    [key: string]: string | string[] | { equal: string } | { match: string } | {
        gt: string;
        inclusive: boolean;
    } | { lt: string; inclusive: boolean };
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
    resource: Resource;
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
