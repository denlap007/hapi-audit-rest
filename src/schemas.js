import Validate from "@hapi/validate";

const constants = {
    FIFTEEN_MINS_MSECS: 900000,
    DERAULT_CLIENT_ID: "my-app",
    DEFAULT_SOURCE_ID: "id",
};

const isAuditable = () => (path, method) => path.startsWith("/api");
const eventHandler = () => (data) => {
    console.log(
        "=============== Emitted Audit Record ===============\n",
        JSON.stringify(data, null, 4)
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
        withAuth: Validate.boolean().default(true),
        usernameKey: Validate.string().when("withAuth", {
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
};
