import {
    ApiVersion,
    ExpectedRequestBodyContent,
    HttpMethod,
    InvalidJsonContent,
    JRPCEnvironment,
    JRPCError,
    LogLevel,
    OperationContext,
    ProcedureHandler,
    ProcedureInput,
    ProcedureNotFound,
    ProtocolVersion,
    ProtocolVersions,
    RequestContext,
    RequestMethodNotSupported,
    RequestOperation,
    RequestOperationCreate,
    RequestOperationDelete,
    RequestOperationExecute,
    RequestOperationFetch,
    RequestOperationUpdate,
    Resource,
    ResourceHandler,
    ResourceNotFound,
    ResourceReference,
    ServerRequest,
    ServerResponse,
    ServerResponseError,
    ServerWebSocket,
    toErrorResponse,
    UnhandledError,
    UpgradeRequestNotSupported,
} from './types/index.ts';
import { getResourceReference, removeUndefined, selectProps } from './utils.ts';

export class Server {
    private logLevel: LogLevel = LogLevel.INFO;
    private protocolVersion: ProtocolVersion = ProtocolVersions.v1;

    /**
     * List of registered procedures per API version
     */
    private procedures = new Map<
        string,
        Map<string, ProcedureHandler<ProcedureInput, Resource>>
    >();

    /**
     * List of registered resource handlers per API version
     */
    private resourceHandlers = new Map<
        string,
        Map<string, ResourceHandler<Resource>>
    >();

    /**
     * Function to execute before processing any operation
     */
    private beforeAllFunc?: <R extends Resource>(
        context: RequestContext,
    ) => Promise<void>;

    /**
     * Function to execute before processing an operation
     */
    private beforeOperationFunc?: <R extends Resource>(
        context: RequestContext,
        operation: RequestOperation,
    ) => Promise<void>;

    /**
     * Function to execute after an operation has been processed
     */
    private afterOperationFunc?: <R extends Resource>(
        context: RequestContext,
        operation: RequestOperation,
    ) => Promise<void>;

    /**
     * Function to execute after all operations have been processed
     */
    private afterAllFunc?: <R extends Resource>(
        context: RequestContext,
    ) => Promise<void>;

    /**
     * Function to execute when an operation errs
     */
    private onOperationErrorFunc?: <R extends Resource>(
        context: RequestContext,
        operation: RequestOperation,
        error: Error,
    ) => Promise<JRPCError | undefined>;

    /**
     * List of connected WS clients
     */
    private connectedClients = new Map<string, ServerWebSocket>();

    constructor(
        private configuration: {
            host: string;
            port: number;
            env: JRPCEnvironment;
        } = {
            host: 'localhost',
            port: 8000,
            env: JRPCEnvironment.PROD,
        },
    ) {}

    /**
     * Method to register a single procedure
     */
    public registerProcedure(
        procedure: ProcedureHandler<ProcedureInput, Resource>,
    ): Server {
        let apiProcedures = this.procedures.get(procedure.apiVersion);

        if (!apiProcedures) {
            apiProcedures = new Map<
                string,
                ProcedureHandler<ProcedureInput, Resource>
            >();
            this.procedures.set(procedure.apiVersion, apiProcedures);
        }

        apiProcedures.set(procedure.name, procedure);

        return this;
    }

    /**
     * Method to register multiple procedures
     */
    public registerProcedures(
        procedures: ProcedureHandler<ProcedureInput, Resource>[],
    ): Server {
        for (const procedure of procedures) {
            this.registerProcedure(procedure);
        }

        return this;
    }

    /**
     * Method to register a single resource handler
     */
    public registerResourceHandler(
        resourceHandler: ResourceHandler<Resource>,
    ): Server {
        let apiResourceHandlers = this.resourceHandlers.get(
            resourceHandler.apiVersion,
        );

        if (!apiResourceHandlers) {
            apiResourceHandlers = new Map<
                string,
                ResourceHandler<Resource>
            >();

            this.resourceHandlers.set(
                resourceHandler.apiVersion,
                apiResourceHandlers,
            );
        }

        apiResourceHandlers!.set(resourceHandler.name, resourceHandler);

        return this;
    }

    /**
     * Method to register multiple resource handlers
     */
    public registerResourceHandlers(
        resourceHandlers: ResourceHandler<Resource>[],
    ): Server {
        for (const resourceHandler of resourceHandlers) {
            this.registerResourceHandler(resourceHandler);
        }

        return this;
    }

    public beforeAll(
        func: (
            context: RequestContext,
        ) => Promise<void>,
    ) {
        this.beforeAllFunc = func;

        return this;
    }

    /**
     * Sets a function to be executed right before processing an operation
     */
    public beforeOperation(
        func: (
            context: RequestContext,
            operation: RequestOperation,
        ) => Promise<void>,
    ) {
        this.beforeOperationFunc = func;

        return this;
    }

    /**
     * Sets a function to be executed right before processing an operation
     */
    public afterOperation(
        func: (
            context: RequestContext,
        ) => Promise<void>,
    ) {
        this.afterOperationFunc = func;

        return this;
    }

    public afterAll(
        func: (
            context: RequestContext,
        ) => Promise<void>,
    ) {
        this.afterAllFunc = func;

        return this;
    }

    public onOperationError(
        func: (
            context: RequestContext,
            operation: RequestOperation,
            error: Error,
        ) => Promise<JRPCError | undefined>,
    ) {
        this.onOperationErrorFunc = func;

        return this;
    }

    /**
     * Starts the server
     */
    public start(options: {
        protocolVersion?: ProtocolVersion;
        requests?: {
            maxInputPayload?: number;
        };
    } = {
        protocolVersion: ProtocolVersions.v1,
        requests: { maxInputPayload: 256 },
    }): void {
        const hostname = this.configuration.host;
        const port = this.configuration.port;

        if (options) {
            if (options.protocolVersion) {
                this.protocolVersion = options.protocolVersion;
            }
        }

        const handler = (req: Request) => {
            return this.handler(req);
        };

        const server = Deno.serve({
            hostname,
            port,
            onListen() {
                console.log(
                    `Server listening on http://${hostname}:${port}/.`,
                );
            },
        }, handler);

        server.finished.then(() => {
            console.log('Server closed.');
        });
    }

    /**
     * Handles incoming requests
     */
    private async handler(req: Request): Promise<Response> {
        if (!req.headers.get('upgrade')) {
            return (await this.handleHTTPRequest(req));
        }

        if (req.headers.get('upgrade') != 'websocket') {
            const response: ServerResponseError = {
                version: this.protocolVersion,
                api: 'unknown',
                error: toErrorResponse(new UpgradeRequestNotSupported()),
            };

            return Response.json(response, { status: 501 });
        }

        return this.handleWebsocketRequest(req);
    }

    /**
     * Handles request coming through HTTP
     */
    private async handleHTTPRequest(req: Request): Promise<Response> {
        const url = new URL(req.url);

        if (this.logLevel <= LogLevel.INFO) {
            console.log(`http: ${req.method} ${url.pathname}`);
        }

        if (req.method !== HttpMethod.POST) {
            const response: ServerResponseError = {
                version: this.protocolVersion,
                api: 'unknown',
                error: toErrorResponse(new RequestMethodNotSupported()),
            };

            return Response.json(response, { status: 405 });
        }

        if (!req.body) {
            const response: ServerResponseError = {
                version: this.protocolVersion,
                api: 'unknown',
                error: toErrorResponse(new ExpectedRequestBodyContent()),
            };

            return Response.json(response, { status: 400 });
        }

        const bodyReader = req.body.getReader();
        let bodyContent: number[] = [];

        while (true) {
            const chunk = await bodyReader.read();

            if (chunk.done) {
                break;
            }

            bodyContent = [...bodyContent, ...chunk.value];
        }

        const rawContent = new TextDecoder().decode(
            new Uint8Array(bodyContent),
        );

        let request: ServerRequest;

        try {
            request = JSON.parse(rawContent);
        } catch (e) {
            const response: ServerResponseError = {
                version: this.protocolVersion,
                api: 'unknown',
                error: toErrorResponse(new InvalidJsonContent()),
            };

            return Response.json(response, { status: 400 });
        }

        try {
            const serverResponse = await this.processRequest(request);
            return Response.json(serverResponse);
        } catch (e) {
            //todo: process the error
            throw e;
        }
    }

    /**
     * Handles request coming through WebSockets
     */
    private handleWebsocketRequest(req: Request): Response {
        const webSocketUpgrade = Deno.upgradeWebSocket(req);
        const socket = webSocketUpgrade.socket as ServerWebSocket;

        socket.id = crypto.randomUUID();
        this.connectedClients.set(socket.id, socket);

        socket.addEventListener('open', () => {
            if (this.logLevel <= LogLevel.INFO) {
                console.log(`ws: ${socket.id} client connected.`);
            }
        });
        socket.addEventListener('message', async (event) => {
            const result = await this.processRequest(event.data);

            socket.send(JSON.stringify(result));
        });

        socket.addEventListener('close', () => {
            if (this.logLevel <= LogLevel.INFO) {
                console.log(`ws: ${socket.id} client disconnected.`);
            }

            this.connectedClients.delete(socket.id);
        });

        return webSocketUpgrade.response;
    }

    private async processRequest(
        request: ServerRequest,
    ): Promise<ServerResponse> {
        const { jrpc, api: apiVersion, operations } = request;

        const serverResponse: ServerResponse = {
            jrpc,
            api: apiVersion,
            operations: [],
            resources: {},
        };

        const resources = this.resourceHandlers.get(apiVersion);
        const context = new RequestContext(removeUndefined({
            settings: request.settings,
            authentication: request.authentication,
        }));

        if (this.beforeAllFunc) {
            try {
                await this.beforeAllFunc(context);
            } catch (e) {
                // todo: return a response when this hook fails
            }
        }

        // todo: execute the operations in parallel or sequence, depending on the execution type defined in the request
        for (const operation of operations) {
            context.operationContext = new OperationContext(
                apiVersion,
                operation,
            );

            if (this.beforeOperationFunc) {
                await this.beforeOperationFunc(context, operation);
            }

            let result: Resource | Resource[] | undefined;

            try {
                result = await this.processOperation(
                    operation,
                    apiVersion,
                    context,
                );

                context.operationContext.result = result;

                if (this.afterOperationFunc) {
                    await this.afterOperationFunc(context, operation);
                }

                this.processOperationResult(
                    context.operationContext.result,
                    operation,
                    serverResponse,
                );
            } catch (e) {
                this.processOperationError(
                    e as JRPCError,
                    operation,
                    serverResponse,
                );
            }

            if (this.afterOperationFunc) {
                await this.afterOperationFunc(
                    context,
                    operation,
                );
            }
        }

        this.returnSelectedProps(serverResponse, request.return);

        if (this.afterAllFunc) {
            await this.afterAllFunc(context);
        }

        return serverResponse;
    }

    private async processOperation<R extends Resource>(
        operation: RequestOperation,
        apiVersion: ApiVersion,
        context: RequestContext,
    ): Promise<Resource | Resource[] | undefined> {
        if ('execute' in operation) {
            return await this.handleExecuteOperation(
                apiVersion,
                operation,
                context,
            );
        }

        if ('fetch' in operation) {
            return await this.handleFetchOperation(
                apiVersion,
                operation,
                context,
            );
        }

        if ('create' in operation) {
            return await this.handleCreateOperation(
                apiVersion,
                operation,
                context,
            );
        }

        if ('update' in operation) {
            return await this.handleUpdateOperation(
                apiVersion,
                operation,
                context,
            );
        }

        if ('delete' in operation) {
            await this.handleDeleteOperation(
                apiVersion,
                operation,
                context,
            );
        }

        // if ('subscribe' in operation) {
        //     if (resources) {
        //         const resourceHandler = resources.get(
        //             operation.subscribe,
        //         );
        //
        //         if (resourceHandler) {
        //             await resourceHandler.subscribe(operation.return);
        //         }
        //     }
        // }
    }

    private async handleExecuteOperation<R extends Resource>(
        apiVersion: ApiVersion,
        operation: RequestOperation & RequestOperationExecute,
        context: RequestContext,
    ): Promise<Resource> {
        const apiProcedures = this.procedures.get(apiVersion);

        if (!apiProcedures) {
            throw new ProcedureNotFound();
        }

        const procedure = apiProcedures.get(operation.execute);

        if (!procedure) {
            throw new ProcedureNotFound();
        }

        try {
            return await procedure.execute(
                context,
                operation.properties as ProcedureInput,
            );
        } catch (e) {
            throw await this.handleOperationError(
                context,
                operation,
                e as Error,
            );
        }
    }

    private async handleFetchOperation<R extends Resource>(
        apiVersion: ApiVersion,
        operation: RequestOperationFetch,
        context: RequestContext,
    ) {
        const apiResourceHandlers = this.resourceHandlers.get(apiVersion);

        if (!apiResourceHandlers) {
            throw new ResourceNotFound();
        }

        const resourceHandler = apiResourceHandlers.get(
            operation.fetch,
        );

        if (!resourceHandler) {
            throw new ResourceNotFound();
        }

        try {
            return await resourceHandler.fetch(
                operation.properties as Resource,
                context,
            );
        } catch (e) {
            throw (await this.handleOperationError(
                context,
                operation,
                e as Error,
            ));
        }
    }

    private async handleCreateOperation<R extends Resource>(
        apiVersion: ApiVersion,
        operation: RequestOperationCreate,
        context: RequestContext,
    ) {
        const apiResourceHandlers = this.resourceHandlers.get(apiVersion);

        if (!apiResourceHandlers) {
            throw new ResourceNotFound();
        }

        const resourceHandler = apiResourceHandlers.get(
            operation.create,
        );

        if (!resourceHandler) {
            throw new ResourceNotFound();
        }

        try {
            return await resourceHandler.create(
                operation.properties as Resource,
                context,
            );
        } catch (e) {
            throw (await this.handleOperationError(
                context,
                operation,
                e as Error,
            ));
        }
    }

    private async handleUpdateOperation<R extends Resource>(
        apiVersion: ApiVersion,
        operation: RequestOperationUpdate,
        context: RequestContext,
    ) {
        const apiResourceHandlers = this.resourceHandlers.get(apiVersion);

        if (!apiResourceHandlers) {
            throw new ResourceNotFound();
        }

        const resourceHandler = apiResourceHandlers.get(
            operation.update,
        );

        if (!resourceHandler) {
            throw new ResourceNotFound();
        }

        try {
            return await resourceHandler.update(
                operation.properties as Resource,
                context,
            );
        } catch (e) {
            throw (await this.handleOperationError(
                context,
                operation,
                e as Error,
            ));
        }
    }

    private async handleDeleteOperation<R extends Resource>(
        apiVersion: ApiVersion,
        operation: RequestOperationDelete,
        context: RequestContext,
    ) {
        const apiResourceHandlers = this.resourceHandlers.get(apiVersion);

        if (!apiResourceHandlers) {
            throw new ResourceNotFound();
        }

        const resourceHandler = apiResourceHandlers.get(
            operation.delete,
        );

        if (!resourceHandler) {
            throw new ResourceNotFound();
        }

        try {
            return await resourceHandler.delete(
                operation.properties as Resource,
                context,
            );
        } catch (e) {
            throw (await this.handleOperationError(
                context,
                operation,
                e as Error,
            ));
        }
    }

    private async handleOperationError(
        context: RequestContext,
        operation: RequestOperation,
        e: Error,
    ): Promise<Error> {
        let customError: JRPCError | undefined;

        if (this.onOperationErrorFunc) {
            customError = await this.onOperationErrorFunc(
                context,
                operation,
                e,
            );
        }

        if (customError !== undefined) {
            return customError;
        }

        if (e instanceof JRPCError) {
            return e;
        }

        return new UnhandledError();
    }

    private processOperationResult(
        resources: Resource | Resource[] | undefined,
        operation: RequestOperation,
        response: ServerResponse,
    ) {
        if (resources === undefined) return;

        if (Array.isArray(resources)) {
            const references = [];

            for (const resource of resources) {
                const resourceReference = getResourceReference(resource);
                response.resources[resourceReference] = resource;
                references.push(resourceReference);
            }

            response.operations.push({ id: operation.id, result: references });
        } else {
            const resourceReference = getResourceReference(resources);

            response.operations.push({
                id: operation.id,
                result: resourceReference,
            });
            response.resources[resourceReference] = resources;
        }
    }

    private processOperationError(
        error: JRPCError,
        operation: RequestOperation,
        response: ServerResponse,
    ) {
        response.operations.push({
            id: operation.id,
            error: toErrorResponse(error),
        });
    }

    private returnSelectedProps(
        response: ServerResponse,
        returnProps?: { [key: string]: string[] },
    ) {
        const resourceReferences = Object.keys(
            response.resources,
        ) as ResourceReference[];

        for (const reference of resourceReferences) {
            const resource = response.resources[reference];
            if (returnProps && returnProps[resource._resource_name]) {
                response.resources[reference] = selectProps(resource, {
                    select: returnProps[resource._resource_name],
                }) as Resource;
            } else {
                response.resources[reference] = selectProps(resource, {
                    ignore: ['_resource_id', '_resource_name'],
                }) as Resource;
            }
        }
    }
}
