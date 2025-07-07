import { Resource, ResourceReference } from './types/index.ts';

export function id<T extends string>(): T {
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
    return `${resource._resource_name}:${resource._resource_id ? resource._resource_id : 'unknown'}` as ResourceReference;
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
