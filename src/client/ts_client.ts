import { ProcedureHandlerInterface } from '../types/index.ts';
import { schemaToTypescript } from './utils.ts';

let genericTypes = `
export type ProcedureOperation = {
    id: string;
    type: 'execute';
    procedure: string;
    properties?: Record<string, unknown>
}

export type ProcedureOperationOptions = {
    id?: string;
}

export type ProcedureResult = {
    id: string;
} & {
    results: string | string[]
} | {
    error: {
        code: string;
        message: string;
        details?: Record<string, unknown>;
    }
}

export type SubscribeOperation = {
    id: string;
    type: 'subscribe';
    topic: string;
}

export type Response = {
    jrpc: string;
    api: string;
    operations: ProcedureResult;
    resources: Record<string, unknown>[];
}

export type Request = {
    jrpc: string;
    api: string;
    authentication?: {
        scheme: 'bearer';
        token: string;
        token_format: 'JWT'
    }
    operations: (ProcedureOperation | SubscribeOperation)[];
    return: Record<string, unknown>
}

export type ClientOptions = {
    authentication?: {
        scheme: 'bearer',
        token: string,
        token_format: 'JWT'
    }
}
`;

let prodecureTemplate = (
    name: string,
    procedure: ProcedureHandlerInterface,
) => {
    let inputType = '';
    if (procedure.input) {
        if (procedure.input.type == 'object') {
            inputType += `input: ${schemaToTypescript(procedure.input)}`;
        }
    } else {
        inputType = 'input?: undefined';
    }

    let options = 'options?: ProcedureOperationOptions';
    if (inputType) {
        options = `, ${options}`;
    }

    return `
        ${name}: (${inputType}${options}) => {
            this.addProcedureOperation('${name}', input, options);
            return this.procedures;
        },
`;
};

let clientTemplate = (
    apiVersion: string,
    proceduresCode: string,
    resourcesCode: string,
) => `
export class Client_${apiVersion} {
    private apiVersion = "${apiVersion}";
    private operations: ProcedureOperation[] = [];
    
    private subscriptions: Record<string, WebSocket> = {};

    constructor(private host: string, private port: number) {}

    /* procedures */
    public procedures = {
        ${proceduresCode}
    }

    /* resources */
    public resources = {
        ${resourcesCode}
    }

    // todo: allow an option to define what content should be returned in the [return] section
    public async send(options?: ClientOptions) {
        try {
            const payload = this.buildRequestPayload(this.operations, options);

            console.log('=====> Sending payload')
            console.log(payload)
            
            const url = 'http://' + this.host + ':' + this.port;

            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(payload),
            });
            
            this.operations = [];

            if (!response.ok) {
                throw new Error();
            }

            const json = await response.json();
            
            console.log('<==== Received payload')
            console.log(json)
            
            return json;
        } catch (error) {
            console.error('Error posting data:', error);
        }
    }
    
    public subscribe(handlers: { topic: string, handler: (message: unknown) => Promise<void> }[], options?: ClientOptions) {
        const websocket = new WebSocket('ws://' + this.host + ':' + this.port);
        
        const subscribeOperation: SubscribeOperation[] = [];
        
        for (const handler of handlers) {
            subscribeOperation.push({
              id: 'subscribe_to_' + handler.topic,
              type: 'subscribe',
              topic: handler.topic
            })
        }
        
        websocket.onopen = (e) => {
            const payload = this.buildRequestPayload(subscribeOperation, options);
            console.log('=====> Sending payload')
            console.log(payload)
            websocket.send(JSON.stringify(payload));
        };
        
        websocket.onclose = (e) => {
            console.log('DISCONNECTED');
        };
        
        websocket.onmessage = (e) => {
            console.log('RECEIVED:');
            console.log('----');
            console.log(JSON.parse(e.data));
            
            // todo: route the message to the right handler
        };
        
        websocket.onerror = (e) => {
            console.log('ERROR:', e);
        };
    }

    /* client private implementation */
    private addProcedureOperation(procedureName: string, input?: Record<string, unknown>, options?: ProcedureOperationOptions) {
        const operation:ProcedureOperation = {
            id: options?.id ?? this.getNewId(),
            type: 'execute',
            procedure: procedureName
        } 
        
        if (input) {
            operation.input = input;
        }
        
        this.operations.push(operation)
    }

    private buildRequestPayload(operations: ProcedureOperation[] | SubscribeOperation[], options?: ClientOptions): Request {
        const request:Request = {
            jrpc: 'v1',
            api: this.apiVersion,
            operations
        }
        
        if (options?.authentication) {
            request.authentication = {
                scheme: options.authentication.scheme,
                token: options.authentication.token,
                token_format: options.authentication.token_format,
            }
        }
        
        return request;
    }

    private getNewId() {
        return crypto.randomUUID();
    }
}
`;

export function generateClient(
    serverProcedures: Map<
        string,
        Map<string, ProcedureHandlerInterface>
    >,
): string {
    const apis: Record<
        string,
        { proceduresCode: string; resourcesCode: string }
    > = {};

    for (const [version, procedures] of serverProcedures) {
        let proceduresCode = '';
        for (const [procedureName, procedure] of procedures) {
            proceduresCode += prodecureTemplate(procedureName, procedure);
        }

        if (!apis[version]) {
            apis[version] = { proceduresCode: '', resourcesCode: '' };
        }
        apis[version].proceduresCode = proceduresCode;
    }

    let allClientCode = `${genericTypes}`;

    for (const apiVersion of Object.keys(apis)) {
        const code = apis[apiVersion];
        allClientCode += clientTemplate(
            apiVersion,
            code.proceduresCode,
            code.resourcesCode,
        );
    }

    return allClientCode;
}
