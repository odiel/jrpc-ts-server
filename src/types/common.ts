declare const __brand: unique symbol;
type Brand<B> = { [__brand]: B };
export type Branded<T, B> = T & Brand<B>;

export enum HttpMethod {
    GET = 'GET',
    POST = 'POST',
}

export enum JRPCEnvironment {
    DEV = 'development',
    STAGING = 'staging',
    PROD = 'production',
}

export enum LogLevel {
    DEBUG = 0,
    INFO = 1,
}

export type JsonPrimitive = string | number | boolean | null;
export type JsonArray = Json[];
export type JsonObject = { [key: string]: Json };
export type JsonComposite = JsonArray | JsonObject;
export type Json = JsonPrimitive | JsonComposite;


export type ProtocolVersion = Branded<string, 'ProtocolVersion'>;
export type ApiVersion = Branded<string, 'ApiVersion'>;
export type RequestId = Branded<string, 'RequestId'>;
export type ResourceName = Branded<string, 'ResourceName'>;
export type ProcedureName = Branded<string, 'ProcedureName'>;
export type ResourceId = Branded<string, 'ResourceId'>;
export type ResourceReference = Branded<
    `${ResourceName}:${ResourceId}`,
    'ResourceReference'
>;

export const ProtocolVersions = {
    v1: 'v1' as ProtocolVersion,
};

export type ServerWebSocket = WebSocket & { id: string };




