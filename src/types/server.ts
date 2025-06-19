export type ServerWebSocket = WebSocket & { id: string };

export enum LogLevel {
    DEBUG = 0,
    INFO = 1,
}

export enum HttpMethod {
    GET = 'GET',
    OPTIONS = 'OPTIONS',
    POST = 'POST',
    PUT = 'PUT',
    PATCH = 'PATCH',
    DELETE = 'DELETE',
}

export enum HttpStatusCode {
    OK = 200,
}

export enum HttpContentType {
    APPLICATION_JSON = 'application/json',
}
