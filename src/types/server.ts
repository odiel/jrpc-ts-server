export type ServerWebSocket = WebSocket & { id: string };

export enum LogLevel {
    DEBUG = 0,
    INFO = 1,
}

export enum HttpMethod {
    POST = 'POST',
}

export enum JRPCEnvironment {
    DEV = 'development',
    STAGING = 'staging',
    PROD = 'production',
}
