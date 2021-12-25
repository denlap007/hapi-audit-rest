import Validate from "@hapi/validate";

import Utils from "./utils";
import Schemas from "./schemas";
import Pkg from "../package.json";

const internals = {};

internals.pluginName = "hapi-audit-rest";

internals.schema = Schemas.baseSchema;

internals.handleError = (settings, request, error) => {
    if (settings.debug) {
        console.error(`[${internals.pluginName}]`, error);
    }
    request.log(["error", internals.pluginName], error.message);
};

internals.fetchValues = async (
    { server, headers, auth, url: { pathname }, method },
    pathOverride
) => {
    const { payload, statusCode } = await server.inject({
        validate: true,
        method: "GET",
        url: pathOverride || pathname,
        headers: { ...headers, injected: "true" },
        auth: auth.isAuthenticated ? auth : undefined,
    });

    if (Utils.isSuccess(statusCode)) {
        return JSON.parse(payload);
    }

    const routeEndpoint = Utils.toEndpoint(method, pathname);
    throw new Error(
        `Could not fetch values for injected request get:${pathname} before ${routeEndpoint}: ${payload}`
    );
};

exports.plugin = {
    pkg: Pkg,
    requirements: {
        hapi: ">=18.0.0",
    },
    async register(server, options) {
        const settings = Validate.attempt(
            options,
            internals.schema,
            `[${internals.pluginName}]: Invalid registration options!`
        );

        if (!settings.isEnabled) return;

        // initialize cache
        const oldValsCache = new Utils.ValuesCache();

        // register event and handler
        server.event(internals.pluginName);
        server.events.on(internals.pluginName, settings.eventHandler);

        // plugin options route validation
        server.ext("onPreStart", () => {
            server
                .table()
                .filter((route) => internals.pluginName in route.settings.plugins)
                .forEach((route) => {
                    Validate.assert(
                        route.settings.plugins[internals.pluginName],
                        Schemas.routeSchema,
                        `[${internals.pluginName}]: Invalid route options on ${route.path}`
                    );
                });
        });

        server.ext("onPreHandler", async (request, h) => {
            try {
                const { [internals.pluginName]: routeOptions = {} } =
                    request.route.settings.plugins;
                const {
                    url: { pathname },
                    method,
                } = request;

                /**
                 * skip audit if disabled on route, path does not match criteria
                 * if this will be handled as a custom action skip to process on preResponse, is GET request go on preResponse
                 */
                if (
                    !Utils.isEnabled(routeOptions) ||
                    !settings.isAuditable(pathname, method) ||
                    routeOptions.isAction ||
                    Utils.isRead(method)
                ) {
                    return h.continue;
                }

                // Ovveride, creates GET endpoint
                const pathOverride = Validate.attempt(
                    routeOptions.getPath?.(request),
                    Schemas.getRoutePath
                );
                const getEndpoint = Utils.toEndpoint("get", pathname, pathOverride);

                if (Utils.isUpdate(method)) {
                    let oldVals = settings.cacheEnabled ? oldValsCache.get(getEndpoint) : null;

                    if (oldVals == null) {
                        oldVals = await internals.fetchValues(request, pathOverride);
                        oldValsCache.set(getEndpoint, oldVals);
                    }
                } else if (Utils.isDelete(method)) {
                    const oldVals = await internals.fetchValues(request, pathOverride);
                    oldValsCache.set(getEndpoint, oldVals);
                }
            } catch (error) {
                internals.handleError(settings, request, error);
            }

            return h.continue;
        });

        server.ext("onPreResponse", async (request, h) => {
            try {
                const { [internals.pluginName]: routeOptions = {} } =
                    request.route.settings.plugins;
                const username = Utils.getUser(request, settings.usernameKey);
                const {
                    url: { pathname },
                    headers,
                    method,
                    query,
                    params,
                    payload: reqPayload,
                    response: { source: resp, statusCode },
                } = request;
                const { injected } = headers;
                /**
                 * skip audit IF disabled on route, path does not match criteria,
                 * call failed, is injected GET request
                 */
                if (
                    !Utils.isEnabled(routeOptions) ||
                    !settings.isAuditable(pathname, method) ||
                    !Utils.isSuccess(statusCode) ||
                    !!injected
                ) {
                    return h.continue;
                }

                const pathOverride = Validate.attempt(
                    routeOptions.getPath?.(request),
                    Schemas.getRoutePath
                );
                const createMutation = Utils.initMutation({
                    method,
                    clientId: settings.clientId,
                    username,
                });
                const createAction = Utils.initAction({
                    clientId: settings.clientId,
                    username,
                });
                const routeEndpoint = Utils.toEndpoint(method, pathname);
                const getEndpoint = Utils.toEndpoint("get", pathname, pathOverride);
                let auditLog = null;

                if (Utils.isRead(method)) {
                    auditLog = await routeOptions.ext?.(request);
                    Validate.assert(auditLog, Schemas.actionSchema);

                    const entityId = auditLog?.entityId || Utils.getId(params);

                    // cache only GET by id response
                    if (settings.cacheEnabled && !Utils.isStream(resp) && !!entityId) {
                        oldValsCache.set(getEndpoint, resp);
                    }

                    auditLog = createAction({
                        entity: settings.getEntity(pathname),
                        entityId,
                        data: query,
                        ...auditLog,
                    });
                } else if (
                    (Utils.isUpdate(method) || Utils.isCreate(method) || Utils.isDelete(method)) &&
                    routeOptions.isAction
                ) {
                    auditLog = await routeOptions.ext?.(request);
                    Validate.assert(auditLog, Schemas.actionSchema);

                    if (Utils.isStream(reqPayload) && auditLog == null) {
                        throw new Error(`Cannot read streamed payload on ${routeEndpoint}`);
                    }

                    auditLog = createAction({
                        entity: settings.getEntity(pathname),
                        entityId: Utils.isStream(reqPayload)
                            ? Utils.getId(params)
                            : Utils.getId(params, reqPayload),
                        data: Utils.isStream(reqPayload) ? null : reqPayload,
                        ...auditLog,
                    });
                } else if (Utils.isUpdate(method)) {
                    const oldVals = oldValsCache.get(getEndpoint);
                    // check if proxied to upstream server
                    let newVals = Utils.isStream(reqPayload) ? null : Utils.clone(reqPayload);

                    if (newVals == null || routeOptions.fetchNewValues) {
                        newVals = await internals.fetchValues(request, pathOverride);
                    }

                    auditLog = await routeOptions.ext?.(request, {
                        oldVals,
                        newVals,
                        diff: ({ diffOnly, skipDiff }) => {
                            Utils.keepProps(oldVals, newVals, diffOnly);
                            Utils.removeProps(oldVals, newVals, skipDiff);

                            return settings.diffFunc(oldVals, newVals);
                        },
                    });
                    Validate.assert(auditLog, Schemas.mutationSchema);

                    const [originalValues, newValues] = settings.diffFunc(oldVals, newVals);

                    auditLog = createMutation({
                        entity: settings.getEntity(pathname),
                        entityId: Utils.getId(params, newVals),
                        originalValues,
                        newValues,
                        ...auditLog,
                    });

                    oldValsCache.delete(getEndpoint);
                } else if (Utils.isDelete(method)) {
                    const oldVals = oldValsCache.get(getEndpoint);

                    auditLog = await routeOptions.ext?.(request, { oldVals });
                    Validate.assert(auditLog, Schemas.mutationSchema);

                    auditLog = createMutation({
                        entity: settings.getEntity(pathname),
                        entityId: Utils.getId(params, oldVals),
                        originalValues: oldVals,
                        ...auditLog,
                    });
                } else if (Utils.isCreate(method)) {
                    if (!Utils.isStream(resp)) {
                        const data = Utils.gotResponseData(resp) ? resp : reqPayload;

                        auditLog = await routeOptions.ext?.(request, { newVals: data });
                        Validate.assert(auditLog, Schemas.mutationSchema);

                        auditLog = createMutation({
                            entity: settings.getEntity(pathname),
                            entityId: Utils.getId(null, data),
                            newValues: data,
                            ...auditLog,
                        });
                    } else {
                        throw new Error(`Cannot read streamed response on ${routeEndpoint}`);
                    }
                }

                if (auditLog != null) {
                    if (settings?.extAll) {
                        const extendedAuditLog = await settings?.extAll(request, auditLog);

                        auditLog = {
                            ...auditLog,
                            ...extendedAuditLog,
                        };
                    }
                    server.events.emit(internals.pluginName, {
                        auditLog,
                        endpoint: routeEndpoint,
                    });
                } else {
                    throw new Error(`Null auditLog record for endpoint: ${routeEndpoint}`);
                }
            } catch (error) {
                internals.handleError(settings, request, error);
            }

            return h.continue;
        });

        const cacheEvictionInterval = setInterval(() => {
            oldValsCache.clear();
        }, settings.cacheExpiresIn);

        server.ext("onPreStop", () => {
            clearInterval(cacheEvictionInterval);
        });
    },
};
