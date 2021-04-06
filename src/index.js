import Validate from "@hapi/validate";

import Utils from "./utils";
import Schemas from "./schemas";

const internals = {};

internals.pluginName = "hapi-audit-rest";

internals.schema = Schemas.baseSchema;

internals.handleError = (settings, request, error) => {
    if (settings.showErrorsOnStdErr) {
        console.error(`[${internals.pluginName}] ERROR: ${error.message}`, error);
    }
    request.log(["error", internals.pluginName], error.message);
};

internals.fetchValues = async ({ server, headers, auth, url: { pathname } }, pathOverride) =>
    server.inject({
        method: "GET",
        url: pathOverride || pathname,
        headers: { ...headers, injected: "true" },
        auth: auth.isAuthenticated ? auth : undefined,
    });

exports.plugin = {
    requirements: {
        hapi: ">=18.0.0",
    },
    name: internals.pluginName,
    version: "3.2.0",
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
                const {
                    [internals.pluginName]: routeOptions = {},
                } = request.route.settings.plugins;
                const {
                    url: { pathname },
                    method,
                } = request;

                /**
                 * skip audit if disabled on route, not authenticated and auditAuthOnly enabled, path does not match criteria
                 * if this will be handled as a custom action skip to process on preResponse
                 */
                if (
                    !Utils.isEnabled(routeOptions) ||
                    (settings.auditAuthOnly && !request.auth.isAuthenticated) ||
                    !settings.isAuditable(pathname, method) ||
                    routeOptions.isAction
                ) {
                    return h.continue;
                }

                // Ovveride, creates GET endpoint
                const pathOverride = Validate.attempt(
                    routeOptions.getPath?.(request),
                    Schemas.getRoutePath
                );
                const getEndpoint = Utils.toEndpoint("get", pathname, pathOverride);
                const routeEndpoint = Utils.toEndpoint(method, pathname);

                if (Utils.isUpdate(method)) {
                    let oldVals = settings.cacheEnabled ? oldValsCache.get(getEndpoint) : null;

                    if (oldVals == null) {
                        const { payload: data } = await internals.fetchValues(
                            request,
                            pathOverride
                        );
                        oldVals = JSON.parse(data);
                        oldValsCache.set(getEndpoint, oldVals);
                    }

                    if (oldVals == null) {
                        throw new Error(`Cannot get data before update on ${routeEndpoint}`);
                    }
                } else if (Utils.isDelete(method)) {
                    const { payload } = await internals.fetchValues(request, pathOverride);
                    const originalValues = JSON.parse(payload);
                    oldValsCache.set(getEndpoint, originalValues);
                }
            } catch (error) {
                internals.handleError(settings, request, error);
            }

            return h.continue;
        });

        server.ext("onPreResponse", async (request, h) => {
            try {
                const {
                    [internals.pluginName]: routeOptions = {},
                } = request.route.settings.plugins;
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

                // skip audit if disabled on route, not authenticated and auditAuthOnly enabled, path does not match criteria, call failed
                if (
                    !Utils.isEnabled(routeOptions) ||
                    (settings.auditAuthOnly && !request.auth.isAuthenticated) ||
                    !settings.isAuditable(pathname, method) ||
                    !Utils.isSuccess(statusCode)
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

                if (Utils.isRead(method) && injected == null) {
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
                    (Utils.isUpdate(method) || Utils.isCreate(method)) &&
                    routeOptions.isAction
                ) {
                    auditLog = await routeOptions.ext?.(request);
                    Validate.assert(auditLog, Schemas.actionSchema);

                    if (Utils.isStream(reqPayload) && auditLog == null) {
                        throw new Error(`Cannot raed streamed payload on ${routeEndpoint}`);
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
                        const { payload: data } = await internals.fetchValues(
                            request,
                            pathOverride
                        );
                        newVals = JSON.parse(data);
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
                        throw new Error(`Cannot raed streamed response on ${routeEndpoint}`);
                    }
                }

                // skipp auditing of GET requests if enabled, of injected from plugin
                if (Utils.shouldAuditRequest(method, settings.auditGetRequests, injected)) {
                    if (auditLog != null) {
                        server.events.emit(internals.pluginName, {
                            auditLog,
                            endpoint: routeEndpoint,
                        });
                    } else {
                        throw new Error(`Null auditLog record for endpoint: ${routeEndpoint}`);
                    }
                }
            } catch (error) {
                internals.handleError(settings, request, error);
            }

            return h.continue;
        });

        setInterval(() => {
            oldValsCache.clear();
        }, settings.cacheExpiresIn);
    },
};
