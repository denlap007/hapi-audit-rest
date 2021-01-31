import Validate from "@hapi/validate";

const constants = {
    FIFTEEN_MINS_MSECS: 900000,
    DERAULT_CLIENT_ID: "my-app",
};

const isAuditable = () => (path, method) => path.startsWith("/api");
const eventHandler = () => (data) => {
    console.log(
        "=============== Emitted Audit Record ===============\n",
        JSON.stringify(data, null, 4)
    );
};
const diff = () => (left, right) => [left, right];

export default {
    baseSchema: Validate.object({
        auditGetRequests: Validate.boolean().default(true),
        showErrorsOnStdErr: Validate.boolean().default(true),
        diffFunc: Validate.func().arity(2).default(diff),
        disableCache: Validate.boolean().default(false),
        clientId: Validate.string().default(constants.DERAULT_CLIENT_ID),
        sidUsernameAttribute: Validate.string().required(),
        cacheExpiresIn: Validate.number()
            .positive()
            .min(300000)
            .default(constants.FIFTEEN_MINS_MSECS),
        isAuditable: Validate.func().arity(2).default(isAuditable),
        eventHanler: Validate.func().arity(1).default(eventHandler),
    }),
    routeSchema: Validate.alternatives().try(
        Validate.object({
            id: Validate.object({
                keys: Validate.array().items(Validate.string()).single(),
                source: Validate.string().valid("params", "payload").default("params"),
            }),
            eventType: Validate.string(),
            entity: Validate.string(),
            action: Validate.string(),
            simpleAction: Validate.string(),
            getPath: Validate.string(),
            mapParam: Validate.string(),
            auditAsUpdate: Validate.boolean().default(false),
            paramsAsData: Validate.boolean().default(false),
            forceGetAfterUpdate: Validate.boolean().default(false),
            diffOnly: Validate.array().items(Validate.string()).single(),
            skipDiff: Validate.array().items(Validate.string()).single(),
        }),
        Validate.boolean()
    ),
};
