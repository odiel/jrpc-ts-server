import {ProcedureHandlerInterface} from "../types/index.ts";

export function generateDefinitions(
    serverProcedures: Map<
        string,
        Map<string, ProcedureHandlerInterface>
    >
) {
    const apis: Record<
        string,
        { procedures: Record<string, any>; }
    > = {};

    for (const [version, procedures] of serverProcedures) {
        if (!apis[version]) {
            apis[version] = { procedures: {}, };
        }

        for (const [procedureName, procedure] of procedures) {
            apis[version].procedures[procedureName] = {
                input: procedure.input,
                output: procedure.output
            };
        }
    }

    return apis;
}