import { JSONSchema, ProcedureInterface, Resource, ResourceHandlerInterface } from './types/index.ts';

let genericTypes = `
export type Request = {
    jrpc: string;
    api: string;
    authentication?: {
        scheme: 'bearer';
        token: string;
        token_format: 'JWT'
    }
    operations: (ProcedureOperation | ResourceOperation)[];
    return: Record<string, unknown>
}

export type Response = {
    jrpc: string;
    api: string;
    operations: OperationResult;
    resources: Record<string, unknown>[];
}

export type ProcedureOperationOptions = {
    id?: string;
}

export type ResourceOperationOptions = {
    id?: string;
}

export type OperationResult = {
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

export enum ResourceOperationType {
    FETCH = 'fetch',
    CREATE = 'create',
    UPDATE = 'update',
    DELETE = 'delete',
};

export type ProcedureOperation = {
    id: string;
    type: 'execute';
    procedure: string;
    properties?: Record<string, unknown>
}


export type OperationWhere = {
    id: string;
    [key: string]: number | number[] | string | string[] | { equal: string } | { match: string } | {
        gt: number | string;
        inclusive: boolean;
    } | { lt: number | string; inclusive: boolean };
};

export type ResourceOperation = {
    id: string;
    resource: string;
    type: ResourceOperationType;
    properties?: Record<string, unknown>;
    where?: OperationWhere
}

export type ClientOptions = {
    authentication?: {
        scheme: 'bearer',
        token: string,
        token_format: 'JWT'
    }
}
`

let prodecureTemplate = (name: string, procedure: ProcedureInterface<any, any>) => {
    let inputType = ''
    if (procedure.inputSchema) {
        if (procedure.inputSchema.type == 'object') {
            inputType += `input: ${schemaToTypescript(procedure.inputSchema)}`;
        }
    }

    let options = 'options?: ProcedureOperationOptions';
    if (inputType) {
        options = `, ${options}`;
    }

    return `
        ${name}: (${inputType}${options}) => {
            this.addProcedureOperation('${name}', input, options);
        },
`;
}

const resourceTemplate = (resourceName: string, resourceHandler: ResourceHandlerInterface<any>): { types: string, resource: string } => {
    const resourceType = `${resourceName}Resource`

    return {
        types: `
export type ${resourceType} = ${schemaToTypescript(resourceHandler.resourceSchema)}
        `,
        resource: `
        ${resourceName}: {
            create: (resource: ${resourceType}, options?: ResourceOperationOptions) => {
                this.addResourceOperation(ResourceOperationType.CREATE, '${resourceName}', { resource }, options);
            },
            update: (where: OperationWhere, resource: Partial<${resourceType}>, options?: ResourceOperationOptions) => {
                this.addResourceOperation(ResourceOperationType.UPDATE, '${resourceName}', { resource, where }, options);
            },
            delete: (where: OperationWhere, options?: ResourceOperationOptions) => {
                this.addResourceOperation(ResourceOperationType.DELETE, '${resourceName}', { where }, options);
            },
            fetch: (where?: OperationWhere, options?: ResourceOperationOptions) => {
                this.addResourceOperation(ResourceOperationType.FETCH, '${resourceName}', { where }, options);
            },
            subscribe: () => {},
        },
`
    }
}


let clientTemplate = (
    apiVersion: string,
    proceduresCode: string,
    resourcesCode: string,
) => `
export class Client_${apiVersion} {
    private apiVersion = "${apiVersion}";
    private operations: (ProcedureOperation | ResourceOperation)[] = [];

    constructor(private hostUrl: string) {}

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
            const payload = this.buildRequestPayload(options);

            console.log('=====> Sending payload')
            console.log(payload)

            const response = await fetch(this.hostUrl, {
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

    /* client private implementation */
    private addProcedureOperation(procedureName: string, input?: Record<string, unknown>, options?: ProcedureOperationOptions) {
        const operation:ProcedureOperation = {
            id: options?.id ?? this.getNewId(),
            type: 'execute',
            procedure: procedureName
        } 
        
        if (input) {
            operation.properties = input;
        }
        
        this.operations.push(operation)
    }
    
    private addResourceOperation(operationType: ResourceOperationType, resourceName: string, options: { resource?: Record<string, unknown>, where?: OperationWhere }, operationOptions?: ProcedureOperationOptions) {
        const operation:ResourceOperation = {
            id: operationOptions?.id ?? this.getNewId(),
            type: operationType,
            resource: resourceName,
            properties: options.resource
        } 
        
        this.operations.push(operation)
    }

    private buildRequestPayload(options?: ClientOptions): Request {
        const request:Request = {
            jrpc: 'v1',
            api: this.apiVersion,
            operations: this.operations,
            return: {}
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
        Map<string, ProcedureInterface<Resource, Resource>>
    >,
    serverResources: Map<
        string,
        Map<string, ResourceHandlerInterface<Resource>>
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

    for (const [version, resources] of serverResources) {
        let resourceCode = '';
        for (const [resourceName, resourceHandler] of resources) {
            const template = resourceTemplate(resourceName, resourceHandler)
            resourceCode += template.resource;
            genericTypes += template.types;
        }

        if (!apis[version]) {
            apis[version] = { proceduresCode: '', resourcesCode: '' };
        }
        apis[version].resourcesCode = resourceCode;
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

export function generateDefinitions(
    serverProcedures: Map<
        string,
        Map<string, ProcedureInterface<Resource, Resource>>
    >,
    serverResources: Map<
        string,
        Map<string, ResourceHandlerInterface<Resource>>
    >,
) {
    const apis: Record<
        string,
        { procedures: Record<string, any>; resources: Record<string, any> }
    > = {};

    for (const [version, procedures] of serverProcedures) {
        if (!apis[version]) {
            apis[version] = { procedures: {}, resources: {} };
        }

        for (const [procedureName, procedure] of procedures) {
            let definition = {
                input: procedure.inputSchema,
                output: procedure.outputSchema
            };

            apis[version].procedures[procedureName] = definition;
        }
    }

    for (const [version, resources] of serverResources) {
        if (!apis[version]) {
            apis[version] = { procedures: {}, resources: {} };
        }

        for (const [resourceName, resource] of resources) {
            apis[version].resources[resourceName] = resource.resourceSchema;
        }
    }

    return apis;
}

function schemaToTypescript(schema: JSONSchema, name = "Root"): string {
    if (schema.type === "null") {
        return "null";
    }

    if (schema.type === "boolean") {
        return "boolean";
    }

    if (schema.type === "number" || schema.type === "integer") {
        return "number";
    }

    if (schema.type === "string") {
        return "string";
    }

    if (schema.type === "array" && schema.items && typeof schema.items == 'object' && 'type' in schema.items) {
        const itemType = schemaToTypescript(schema.items || {}, name + "Item");
        return `${itemType}[]`;
    }

    if (schema.type === "object") {
        const props = schema.properties || {};
        const required = new Set(schema.required || []);

        const fields: string[] = [];

        for (const propertyName of Object.keys(props)) {
            const propertyBody = props[propertyName];
            if (typeof propertyBody == "object") {
                const tsType = schemaToTypescript(propertyBody, propertyName);
                const optional = required.has(propertyName) ? "" : "?";
                fields.push(`${propertyName}${optional}: ${tsType};`)
            }
        }

        return `{ ${fields.join(' ')} }`;
    }


    return "unknown";
}