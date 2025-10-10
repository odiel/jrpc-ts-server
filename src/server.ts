import {
    ApiVersion,
    ExpectedRequestBodyContent,
    HttpMethod,
    InvalidJsonContent,
    Environment,
    JRPCError,
    LogLevel,
    OperationContext,
    OperationTypeNotSupported,
    ProcedureHandlerInterface, ProcedureName,
    ProcedureNotFound,
    OperationOutput,
    ProtocolVersion,
    ProtocolVersions,
    RequestContext,
    RequestMethodNotSupported,
    Operation,
    Resource,
    ResourceReference,
    ServerRequest,
    ServerResponse,
    ServerResponseError,
    ServerWebSocket, ServerWebSocketId, SubscriptionHandlerInterface, SubscriptionNotFound, SubscriptionTopic,
    toErrorResponse,
    UnhandledError,
    UpgradeRequestNotSupported,
} from './types/index.ts';
import { selectProps } from './utils.ts';
import { ensureDir, exists } from '@std/fs';
import { generateClient, generateDefinitions } from './client/index.ts';

export class Server {
    private logLevel: LogLevel = LogLevel.INFO;
    private protocolVersion: ProtocolVersion = ProtocolVersions.v1;

    /**
     * List of registered procedure handlers per API
     */
    private registeredProcedures = new Map<
        ApiVersion,
        Map<ProcedureName, ProcedureHandlerInterface>
    >();

    /**
     * List of registered subscription handlers per API
     */
    private registeredSubscriptions = new Map<
        ApiVersion,
        Map<SubscriptionTopic, SubscriptionHandlerInterface>
    >()

    /**
     * Callback function to execute as first step of a request before processing any operation
     */
    private beforeAllFunc?: <R extends Resource>(
        context: RequestContext,
    ) => Promise<void>;

    /**
     * Callback function to execute before processing each operation
     */
    private beforeEachFunc?: <R extends Resource>(
        operationContext: OperationContext,
        context: RequestContext,
    ) => Promise<void>;

    /**
     * Callback function to execute after processing each operation
     */
    private afterEachFunc?: <R extends Resource>(
        operationContext: OperationContext,
        context: RequestContext,
    ) => Promise<void>;

    /**
     * Callback function to execute after processing all operations in one request
     */
    private afterAllFunc?: <R extends Resource>(
        context: RequestContext,
    ) => Promise<void>;

    /**
     * Callback function to execute when an unhandled error occurs
     */
    private onErrorFunc?: <R extends Resource>(
        operationContext: OperationContext,
        error: Error,
    ) => Promise<JRPCError | undefined>;

    /**
     * List of connected websocket clients
     */
    private connectedSockets = new Map<string, ServerWebSocket>();

    /**
     * Map of opened websocket connections for each subscription topic
     */
    private subscriptionsByTopics = new Map<
        string,
        { context: RequestContext; socket: ServerWebSocket }[]
    >();

    /**
     * Map of websocket ids and the subscription topics they are listening to
     */
    private socketsInSubscriptions = new Map<
        ServerWebSocketId,
        { topic: string; }[]
    >();

    constructor(
        private configuration: {
            host: string;
            port: number;
            env: Environment;
        },
    ) {}

    /**
     * Use this method to register procedure handlers
     */
    public registerProcedureHandlers<
        T extends ProcedureHandlerInterface,
    >(
        procedures: T[],
    ): Server {
        for (const procedure of procedures) {
            let apiProcedures = this.registeredProcedures.get(procedure.api);

            if (!apiProcedures) {
                apiProcedures = new Map<
                    ProcedureName,
                    ProcedureHandlerInterface
                >();
                this.registeredProcedures.set(procedure.api, apiProcedures);
            }

            apiProcedures.set(procedure.name, procedure);
        }

        return this;
    }

    /**
     * Use this method to register subscription handlers
     */
    public registerSubscriptionHandlers(subscriptionHandlers: SubscriptionHandlerInterface[]) {
        for (const subscriptionHandler of subscriptionHandlers) {
            let apiSubscriptions = this.registeredSubscriptions.get(subscriptionHandler.api);

            if (!apiSubscriptions) {
                apiSubscriptions = new Map<
                    SubscriptionTopic,
                    SubscriptionHandlerInterface
                >();
                this.registeredSubscriptions.set(subscriptionHandler.api, apiSubscriptions);
            }

            apiSubscriptions.set(subscriptionHandler.topic, subscriptionHandler);
        }

        return this;
    }

    /**
     * Sets a callback function to be executed before any operation is processed
     */
    public beforeAll(
        func: (
            context: RequestContext,
        ) => Promise<void>,
    ) {
        this.beforeAllFunc = func;

        return this;
    }

    /**
     * Sets a callback function to be executed before processing each operation
     */
    public beforeEach(
        func: (
            operationContext: OperationContext,
            context: RequestContext,
        ) => Promise<void>,
    ) {
        this.beforeEachFunc = func;

        return this;
    }

    /**
     * Sets a callback function to be executed after each operation is processed
     */
    public afterEach(
        func: (
            operationContext: OperationContext,
            context: RequestContext,
        ) => Promise<void>,
    ) {
        this.afterEachFunc = func;

        return this;
    }

    /**
     * Sets a callback function to be executed after all operations have been processed
     */
    public afterAll(
        func: (
            context: RequestContext,
        ) => Promise<void>,
    ) {
        this.afterAllFunc = func;

        return this;
    }

    /**
     * Sets a callback function to be executed when an unhandled error occurs
     */
    public onError(
        func: (
            operationContext: OperationContext,
            error: Error,
        ) => Promise<JRPCError | undefined>,
    ) {
        this.onErrorFunc = func;

        return this;
    }

    /**
     *  Generates a TS client
     */
    public async generateClients(configuration: { language: 'typescript', path: string}[]) {
        const typesScript = configuration[0];

        if (await exists(typesScript.path)) {
            await Deno.remove(typesScript.path, { recursive: true });
        }

        await ensureDir(typesScript.path);
        await Deno.writeTextFile(
            `${typesScript.path}/index.ts`,
            generateClient(this.registeredProcedures),
        );
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
                    `Server listening for requests on http://${hostname}:${port}/`,
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
                jrpc: this.protocolVersion,
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
        if (req.method !== HttpMethod.POST) {
            if (req.method === HttpMethod.GET) {
                const url = new URL(req.url);
                if (url.pathname == '/definitions') {
                    const response = generateDefinitions(this.registeredProcedures);
                    return Response.json(response, { status: 200 });
                }
            }

            const response: ServerResponseError = {
                jrpc: this.protocolVersion,
                api: 'unknown',
                error: toErrorResponse(new RequestMethodNotSupported()),
            };

            return Response.json(response, { status: 405 });
        }

        if (!req.body) {
            const response: ServerResponseError = {
                jrpc: this.protocolVersion,
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
                jrpc: this.protocolVersion,
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

        socket.id = crypto.randomUUID() as ServerWebSocketId;
        this.connectedSockets.set(socket.id, socket);

        socket.addEventListener('open', () => {
            if (this.logLevel <= LogLevel.INFO) {
                console.log(`ws: ${socket.id} client connected.`);
            }
        });
        socket.addEventListener('message', async (event) => {
            if (!event.data) {
                const response: ServerResponseError = {
                    jrpc: this.protocolVersion,
                    api: 'unknown',
                    error: toErrorResponse(new ExpectedRequestBodyContent()),
                };

                socket.send(JSON.stringify(response));
                return;
            }

            let request;

            try {
                request = JSON.parse(event.data);
            } catch (_e) {
                const response: ServerResponseError = {
                    jrpc: this.protocolVersion,
                    api: 'unknown',
                    error: toErrorResponse(new InvalidJsonContent()),
                };

                socket.send(JSON.stringify(response));
                return;
            }

            // todo: validate the input JSON payload

            const result = await this.processRequest(request, socket);

            socket.send(JSON.stringify(result));
        });

        socket.addEventListener('close', () => {
            if (this.logLevel <= LogLevel.INFO) {
                console.log(`ws: ${socket.id} client disconnected.`);
            }

            this.connectedSockets.delete(socket.id);

            // closing registered subscriptions
            const socketInSubscription = this.socketsInSubscriptions.get(socket.id);

            if (socketInSubscription) {
                for (const entry of socketInSubscription) {
                    const subscriptionTopic = this.subscriptionsByTopics.get(entry.topic);
                    if (subscriptionTopic) {
                        const position = subscriptionTopic.findIndex(e => e.socket.id == socket.id)
                        subscriptionTopic.splice(position, 1);
                    }
                }

                this.socketsInSubscriptions.delete(socket.id);
            }

            console.log(this.socketsInSubscriptions)
            this.subscriptionsByTopics.keys().forEach(e => { console.log(this.subscriptionsByTopics.get(e)!.length)})
        });

        return webSocketUpgrade.response;
    }

    private async processRequest(
        request: ServerRequest,
        socket?: ServerWebSocket,
    ): Promise<ServerResponse> {
        const { jrpc, api: apiVersion, operations } = request;

        const serverResponse: ServerResponse = {
            jrpc,
            api: apiVersion,
            operations: [],
            resources: {},
        };

        const context: RequestContext = {
            authentication: request.authentication,
            executionStrategy: request.settings?.execution_strategy,
            operationTimeout: request.settings?.operation_timeout,
        };

        if (this.beforeAllFunc) {
            try {
                await this.beforeAllFunc(context);
            } catch (e) {
                // todo: return a response when this hook fails
            }
        }

        // todo: execute the operations in parallel or sequence, depending on the execution type defined in the request
        for (const operation of operations) {
            const operationContext: OperationContext = {
                api: apiVersion,
                operation: operation,
                result: undefined,
            };

            if (this.beforeEachFunc) {
                try {
                    await this.beforeEachFunc(operationContext, context);
                } catch (e) {
                    if (e instanceof JRPCError) {
                        this.processOperationError(
                            e as JRPCError,
                            operation,
                            serverResponse,
                        );

                        continue;
                    }

                    this.processOperationError(
                        new UnhandledError(e as Error),
                        operation,
                        serverResponse,
                    );
                    continue;
                }
            }

            let result: OperationOutput;

            try {
                result = await this.processOperation(
                    apiVersion,
                    operation,
                    context,
                    operationContext,
                    socket,
                );

                operationContext.result = result;

                if (this.afterEachFunc) {
                    try {
                        await this.afterEachFunc(operationContext, context);
                    } catch (e) {
                        if (e instanceof JRPCError) {
                            this.processOperationError(
                                e as JRPCError,
                                operation,
                                serverResponse,
                            );

                            continue;
                        }

                        this.processOperationError(
                            new UnhandledError(e as Error),
                            operation,
                            serverResponse,
                        );
                    }
                }

                this.processOperationResult(
                    operationContext.result,
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

            if (this.afterEachFunc) {
                try {
                    await this.afterEachFunc(operationContext, context);
                } catch (e) {
                    if (e instanceof JRPCError) {
                        this.processOperationError(
                            e as JRPCError,
                            operation,
                            serverResponse,
                        );

                        continue;
                    }

                    this.processOperationError(
                        new UnhandledError(e as Error),
                        operation,
                        serverResponse,
                    );
                }
            }
        }

        this.returnSelectedProps(serverResponse, request.return);

        if (this.afterAllFunc) {
            await this.afterAllFunc(context);
        }

        return serverResponse;
    }

    private async processOperation<R extends Resource>(
        api: ApiVersion,
        operation: Operation,
        context: RequestContext,
        operationContext: OperationContext,
        socket?: ServerWebSocket,
    ): Promise<OperationOutput> {
        if (
            ['execute', 'subscribe']
                .indexOf(operation.type) === -1
        ) {
            throw new OperationTypeNotSupported();
        }

        if (operation.type == 'execute') {
            const apiProcedures = this.registeredProcedures.get(api);

            if (!apiProcedures) {
                throw new ProcedureNotFound();
            }

            const procedure = operation.procedure;
            const procedureHandler = apiProcedures.get(procedure);

            if (!procedureHandler) {
                throw new ProcedureNotFound();
            }

            try {
                const r = await procedureHandler.execute({
                    operationContext,
                    context,
                    input: operation.input,
                });

                return r;
            } catch (e) {
                throw await this.handleOperationError(
                    operationContext,
                    operation,
                    e as Error,
                );
            }
        }

        if (operation.type == 'subscribe' && socket) {
            const apiSubscriptions = this.registeredSubscriptions.get(api);

            if (!apiSubscriptions) {
                throw new SubscriptionNotFound();
            }

            const topic = operation.topic;
            const subscriptionHandler = apiSubscriptions.get(topic);

            if (!subscriptionHandler) {
                throw new SubscriptionNotFound();
            }

            subscriptionHandler.registerSocketConnection(socket, context, operationContext);

            // todo: remove the subscriptions if the socket disconnects

            return undefined;
        }
    }

    private async handleOperationError(
        operationContext: OperationContext,
        operation: Operation,
        e: Error,
    ): Promise<Error> {
        let customError: JRPCError | undefined;

        if (this.onErrorFunc) {
            customError = await this.onErrorFunc(
                operationContext,
                e,
            );
        }

        if (customError !== undefined) {
            return customError;
        }

        if (e instanceof JRPCError) {
            return e;
        }

        return new UnhandledError(e);
    }

    private processOperationResult(
        operationResult: OperationOutput,
        operation: Operation,
        response: ServerResponse,
    ) {
        if (operationResult === undefined) {
            response.operations.push({
                id: operation.id,
                results: null,
            });

            return;
        }

        const references = Object.keys(operationResult) as ResourceReference[];

        response.operations.push({
            id: operation.id,
            results: references.length > 0 ? references : null,
        });

        for (const reference of references) {
            const resource = operationResult[reference];
            response.resources[reference] = resource;
        }
    }

    private processOperationError(
        error: JRPCError,
        operation: Operation,
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
            if (
                returnProps && resource != null &&
                returnProps[resource._resource_name]
            ) {
                response.resources[reference] = selectProps(resource, {
                    select: returnProps[resource._resource_name],
                }) as Resource;
            } else if (resource != null) {
                response.resources[reference] = selectProps(resource, {
                    ignore: ['_resource_id', '_resource_name'],
                }) as Resource;
            }
        }
    }
}
