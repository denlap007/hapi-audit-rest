import Validate from "@hapi/validate";

const constants = {
    FIFTEEN_MINS_MSECS: 900000,
    ONE_MIN_MSECS: 60000,
    DERAULT_CLIENT_ID: "my-app",
    DEFAULT_SOURCE_ID: "id",
};

const isAuditable = () => () => true;
const eventHandler =
    () =>
    ({ auditLog, endpoint }) => {
        console.log(`Audit Log Record for: ${endpoint}\n`, JSON.stringify(auditLog, null, 4));
    };
const diff = () => (left, right) => [left, right];

const setEntity = () => (path) => path;

export default {
    baseSchema: Validate.object({
        auditGetRequests: Validate.boolean().default(true),
        debug: Validate.boolean().default(false),
        diffFunc: Validate.func().arity(2).default(diff),
        isCacheEnabled: Validate.boolean().default(true),
        clientId: Validate.string().default(constants.DERAULT_CLIENT_ID),
        usernameKey: Validate.string(),
        cacheExpiresIn: Validate.number()
            .integer()
            .positive()
            .min(constants.ONE_MIN_MSECS)
            .default(constants.FIFTEEN_MINS_MSECS),
        isAuditable: Validate.func().arity(1).default(isAuditable),
        eventHandler: Validate.func().arity(1).default(eventHandler),
        setEntity: Validate.func().arity(1).default(setEntity),
        isEnabled: Validate.boolean().default(true),
        extAll: Validate.func(),
    }),
    routeSchema: Validate.alternatives().try(
        Validate.object({
            ext: Validate.func(),
            isAction: Validate.boolean().default(false),
            setInjectedPath: Validate.func(),
            fetchNewValues: Validate.boolean().default(false),
        }),
        Validate.boolean()
    ),
    mutationSchema: Validate.alternatives(
        Validate.object({
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
            entityId: Validate.alternatives(
                Validate.number(),
                Validate.string().allow("").allow(null)
            ),
            action: Validate.string(),
            data: Validate.object().allow(null),
        }),
        null
    ),
    getRoutePath: Validate.string().allow(null).default(null),
};
