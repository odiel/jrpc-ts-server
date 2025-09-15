import {
    OperationResult,
    Resource,
    OperationWhere,
    ResourceReference, OperationTypesForSubscriptions,
} from './types/index.ts';

export function newId<T extends string>(): T {
    return crypto.randomUUID() as T;
}

export function selectProps(
    resource: Resource,
    options: { select: string[] } | { ignore: string[] },
): Partial<Resource> {
    if ('select' in options) {
        const r: Partial<Resource> = {};

        for (const property of options.select) {
            r[property] = resource[property];
        }

        return r;
    }

    if ('ignore' in options) {
        const r: Partial<Resource> = { ...resource };

        for (const property of options.ignore) {
            delete r[property];
        }

        return r;
    }

    return {};
}

export function getResourceReference(resource: Resource): ResourceReference {
    return `${resource._resource_name}:${
        resource._resource_id ? resource._resource_id : 'unknown'
    }` as ResourceReference;
}

export function generateSubscriptionResult(operationType: OperationTypesForSubscriptions, resource: Resource) {
    return {
        type: operationType,
        resource,
    }
}

export function generateOperationResult(
    resources: Resource | Resource[],
): OperationResult {
    const operationResult: OperationResult = {};

    if (Array.isArray(resources)) {
        for (const resource of resources as Resource[]) {
            const ref = getResourceReference(resource);
            operationResult[ref] = resource;
        }
    } else {
        const ref = getResourceReference(resources as Resource);
        operationResult[ref] = resources as Resource;
    }

    return operationResult;
}

export function generateEmptyOperationResult(
    resources: Resource | Resource[],
): OperationResult {
    const operationResult: OperationResult = {};

    if (Array.isArray(resources)) {
        for (const resource of resources as Resource[]) {
            const ref = getResourceReference(resource);
            operationResult[ref] = null;
        }
    } else {
        const ref = getResourceReference(resources as Resource);
        operationResult[ref] = null;
    }

    return operationResult;
}

export function removeUndefined(
    obj: Record<string, unknown>,
): Record<string, unknown> {
    const objCopy = structuredClone(obj);
    Object.keys(objCopy).forEach((key) =>
        objCopy[key] === undefined ? delete objCopy[key] : {}
    );
    return objCopy;
}
