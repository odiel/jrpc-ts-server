import {
    Resource,
} from './types/index.ts';

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


export function removeUndefined(
    obj: Record<string, unknown>,
): Record<string, unknown> {
    const objCopy = structuredClone(obj);
    Object.keys(objCopy).forEach((key) =>
        objCopy[key] === undefined ? delete objCopy[key] : {}
    );
    return objCopy;
}
