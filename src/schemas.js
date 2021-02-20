import Validate from "@hapi/validate";

const constants = {
    FIFTEEN_MINS_MSECS: 900000,
    DERAULT_CLIENT_ID: "my-app",
    DEFAULT_SOURCE_ID: "id",
};

const isAuditable = () => (path, method) => path.startsWith("/api");
const eventHandler = () => ({ auditLog, endpoint }) => {
    console.log(
        `===============> Audit Log Record for: ${endpoint}\n`,
        JSON.stringify(auditLog, null, 4)
    );
};
const diff = () => (left, right) => [left, right];

const getEntity = () => (path) => {
    let entity = "";

    if (path.startsWith("/api")) {
        entity = path.split("/")[2];
    }

    if (!entity) {
        throw new Error(`[getEntity] ERROR: Could not extract entity for path: ${path}`);
    }

    return entity;
};

export default {
    baseSchema: Validate.object({
        auditGetRequests: Validate.boolean().default(true),
        showErrorsOnStdErr: Validate.boolean().default(true),
        diffFunc: Validate.func().arity(2).default(diff),
        disableCache: Validate.boolean().default(false),
        clientId: Validate.string().default(constants.DERAULT_CLIENT_ID),
        authOnly: Validate.boolean().default(false),
        usernameKey: Validate.string().when("authOnly", {
            is: true,
            then: Validate.string().required(),
            otherwise: Validate.any(),
        }),
        cacheExpiresIn: Validate.number()
            .positive()
            .min(300000)
            .default(constants.FIFTEEN_MINS_MSECS),
        isAuditable: Validate.func().arity(2).default(isAuditable),
        eventHanler: Validate.func().arity(1).default(eventHandler),
        getEntity: Validate.func().arity(1).default(getEntity),
    }),
    routeSchema: Validate.alternatives().try(
        Validate.object({
            ext: Validate.func(),
            isAction: Validate.boolean().default(false),
            get: Validate.object({
                path: Validate.string().required(),
                sourceId: Validate.string().default(constants.DEFAULT_SOURCE_ID),
            }),
            auditAsUpdate: Validate.boolean().when("isAction", {
                is: true,
                then: false,
                otherwise: Validate.boolean().default(false),
            }),
            fetchNewValues: Validate.boolean().default(false),
        }),
        Validate.boolean()
    ),
    mutationSchema: Validate.alternatives(
        Validate.object({
            type: Validate.string(),
            entity: Validate.string(),
            entityId: Validate.alternatives(
                Validate.number(),
                Validate.string().allow("").allow(null)
            ),
            action: Validate.string(),
            originalValues: Validate.alternatives(Validate.object(), Validate.array(), null),
            newValues: Validate.alternatives(Validate.object(), Validate.array(), null),
        }),
        null
    ),
    actionSchema: Validate.alternatives(
        Validate.object({
            type: Validate.string(),
            entity: Validate.string(),
            entityId: Validate.string().allow("").allow(null),
            action: Validate.string(),
            data: Validate.object().allow(null),
        }),
        null
    ),
};
