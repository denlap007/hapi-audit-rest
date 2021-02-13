import Validate from "@hapi/validate";

import Utils from "./utils";
import Schemas from "./schemas";

const internals = {};

internals.pluginName = "hapi-audit-rest";

internals.schema = Schemas.baseSchema;

internals.handleError = (settings, request, error) => {
    if (settings.showErrorsOnStdErr) {
        console.error(`[${internals.pluginName}] ERROR: ${error.message}`);
    }
    request.log(["error", internals.pluginName], error.message);
};

internals.fetchValues = async ({ server, headers, auth, url: { pathname } }, customGetPath) =>
    server.inject({
        method: "GET",
        url: customGetPath || pathname,
        headers: { ...headers, injected: "true" },
        auth,
    });

exports.plugin = {
    requirements: {
        hapi: ">=17.0.0",
    },
    name: internals.pluginName,
    version: "2.0.0",
    async register(server, options) {
        const settings = Validate.attempt(
            options,
            internals.schema,
            `[${internals.pluginName}]: Invalid plugin options!`
        );
        // initialize cache
        let oldValsCache = new Map();

        // register event and handler
        server.event(internals.pluginName);
        server.events.on(internals.pluginName, settings.eventHanler);

        // plugin options route validation
        server.ext("onPreStart", () => {
            server
                .table()
                .filter((route) => internals.pluginName in route.settings.plugins)
                .forEach((route) => {
                    const rops = route.settings.plugins[internals.pluginName];

                    Validate.attempt(
                        rops,
                        Schemas.routeSchema,
                        `[${internals.pluginName}]: Invalid options on route ${route.path}`
                    );
                });
        });

        // ------------------------------- PRE-HANDLER ------------------------- //
        server.ext("onPreHandler", async (request, h) => {
            try {
                const {
                    [internals.pluginName]: routeOptions = {},
                } = request.route.settings.plugins;
                const {
                    url: { pathname },
                    method,
                    params,
                } = request;

                /**
                 * skip audit if disabled on route, without auth and authOnly enabled, path does not match criteria
                 * if this will be handled as a custom action skip to process on preResponse
                 */
                if (
                    Utils.isDisabled(routeOptions) ||
                    (settings.authOnly && !Utils.hasAuth(request)) ||
                    !settings.isAuditable(pathname, method) ||
                    routeOptions.isAction
                ) {
                    return h.continue;
                }

                /**
                 * Ovveride, creates GET endpoint using the value of the specified path param as an id
                 * and the specified path if provided or else the current
                 */
                const customGetPath = (routeOptions?.get?.path || pathname).replace(
                    new RegExp(/{.*}/, "gi"),
                    params[routeOptions?.get?.sourceId]
                );
                const getEndpoint = Utils.toEndpoint("get", pathname, customGetPath);
                const routeEndpoint = Utils.toEndpoint(method, pathname);

                if (Utils.isUpdate(method) || routeOptions.auditAsUpdate) {
                    let oldVals = null;

                    if (!settings.disableCache) {
                        oldVals = oldValsCache.get(getEndpoint);
                    }

                    if (oldVals == null) {
                        const { payload: data } = await internals.fetchValues(
                            request,
                            customGetPath
                        );
                        oldVals = JSON.parse(data);
                        oldValsCache.set(getEndpoint, oldVals);
                    }

                    if (oldVals == null) {
                        throw new Error(`Cannot get data before update on ${routeEndpoint}`);
                    }
                } else if (Utils.isDelete(method)) {
                    const { payload } = await internals.fetchValues(request, customGetPath);
                    const originalValues = JSON.parse(payload);
                    oldValsCache.set(getEndpoint, originalValues);
                }
            } catch (error) {
                internals.handleError(settings, request, error);
            }

            return h.continue;
        });

        // ------------------------------- PRE-RESPONSE ------------------------- //
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

                // skip audit if disabled on route, without auth and authOnly enabled, path does not match criteria, call failed
                if (
                    Utils.isDisabled(routeOptions) ||
                    (settings.authOnly && !Utils.hasAuth(request)) ||
                    !settings.isAuditable(pathname, method) ||
                    !Utils.isSuccess(statusCode)
                ) {
                    return h.continue;
                }

                const customGetPath = (routeOptions?.get?.path || pathname).replace(
                    new RegExp(/{.*}/, "gi"),
                    params[routeOptions?.get?.sourceId]
                );
                const createMutation = Utils.initMutation({
                    method,
                    clientId: settings.clientId,
                    username,
                    auditAsUpdate: routeOptions.auditAsUpdate,
                });
                const createAction = Utils.initAction({
                    clientId: settings.clientId,
                    username,
                });
                const routeEndpoint = Utils.toEndpoint(method, pathname);
                const getEndpoint = Utils.toEndpoint("get", pathname, customGetPath);
                let rec = null;

                if (Utils.isRead(method) && injected == null) {
                    if (!settings.disableCache && !Utils.isStream(resp)) {
                        oldValsCache.set(getEndpoint, resp);
                    }

                    const entityId = Utils.getId(params);

                    rec = createAction({
                        entity: settings.getEntity(pathname),
                        entityId,
                        data: query,
                        ...routeOptions.ext?.({ headers, query, params }),
                    });
                } else if (
                    (Utils.isUpdate(method) || Utils.isCreate(method)) &&
                    routeOptions.isAction
                ) {
                    if (Utils.isStream(reqPayload)) {
                        throw new Error(`Cannot raed streamed payload on ${routeEndpoint}`);
                    }

                    rec = createAction({
                        entity: settings.getEntity(pathname),
                        entityId: Utils.getId(params, reqPayload),
                        data: reqPayload,
                        ...routeOptions.ext?.({ headers, query, params, payload: reqPayload }),
                    });
                } else if (Utils.isUpdate(method) || routeOptions.auditAsUpdate) {
                    const oldVals = oldValsCache.get(getEndpoint);
                    let newVals = null;

                    // check if proxied to upstream server
                    if (!Utils.isStream(reqPayload)) {
                        newVals = Utils.clone(reqPayload);
                    }

                    if (newVals == null || routeOptions.fetchNewValues) {
                        const { payload: data } = await internals.fetchValues(
                            request,
                            customGetPath
                        );
                        newVals = JSON.parse(data);
                    }

                    const [originalValues, newValues] = settings.diffFunc(oldVals, newVals);

                    rec = createMutation({
                        entity: settings.getEntity(pathname),
                        entityId: Utils.getId(params, newVals),
                        originalValues,
                        newValues,
                        ...routeOptions.ext?.({
                            headers,
                            query,
                            params,
                            oldVals,
                            newVals,
                            diff: ({ diffOnly, skipDiff }) => {
                                if (diffOnly) {
                                    Utils.keepProps(oldVals, newVals, diffOnly);
                                } else {
                                    Utils.removeProps(oldVals, newVals, skipDiff);
                                }
                                return settings.diffFunc(oldVals, newVals);
                            },
                        }),
                    });

                    oldValsCache.delete(getEndpoint);
                } else if (Utils.isDelete(method)) {
                    const oldVals = oldValsCache.get(getEndpoint);
                    rec = createMutation({
                        entity: settings.getEntity(pathname),
                        entityId: Utils.getId(params, oldVals),
                        originalValues: oldVals,
                        ...routeOptions.ext?.({ headers, query, params, oldVals }),
                    });
                } else if (Utils.isCreate(method)) {
                    if (!Utils.isStream(resp)) {
                        const data = Utils.gotResponseData(resp) ? resp : reqPayload;

                        rec = createMutation({
                            entity: settings.getEntity(pathname),
                            entityId: Utils.getId(null, data),
                            newValues: data,
                            ...routeOptions.ext?.({ headers, query, params, newVals: data }),
                        });
                    } else {
                        throw new Error(`Cannot raed streamed response on ${routeEndpoint}`);
                    }
                }

                // skipp auditing of GET requests if enabled, of injected from plugin
                if (Utils.shouldAuditRequest(method, settings.auditGetRequests, injected)) {
                    if (rec != null) {
                        server.events.emit(internals.pluginName, rec);
                    } else {
                        throw new Error(
                            `Cannot audit null audit record for endpoint: ${routeEndpoint}`
                        );
                    }
                }
            } catch (error) {
                internals.handleError(settings, request, error);
            }

            return h.continue;
        });

        setInterval(() => {
            oldValsCache = new Map();
        }, settings.cacheExpiresIn);
    },
};
