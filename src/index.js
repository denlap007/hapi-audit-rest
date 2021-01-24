import Validate from "@hapi/validate";

import Utils from "./utils";
import Schemas from "./schemas";

const internals = {};

internals.pluginName = "hapi-audit-rest";

internals.schema = Schemas.basechema;

internals.handleError = (options, request, error) => {
    if (options.showErrorsOnStdErr) {
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
    version: "1.14.0",
    async register(server, opts) {
        const options = Validate.attempt(
            opts,
            internals.schema,
            `[${internals.pluginName}]: Invalid plugin options!`
        );
        // initialize cache
        let oldValsCache = new Map();

        // register event and handler
        server.event(internals.pluginName);
        server.events.on(internals.pluginName, options.eventHanler);
        // console.log("==== options", options);

        server.ext("onPreStart", () => {
            // plugin options route validation
            server
                .table()
                .filter((route) => internals.pluginName in route.settings.plugins)
                .forEach((route) => {
                    const rops = route.settings.plugins[internals.pluginName];
                    // console.log("==> rops", rops);
                    const op = Validate.attempt(
                        rops,
                        Schemas.routeSchema,
                        `[${internals.pluginName}]: Invalid options on route ${route.path}`
                    );

                    // console.log("===> opts", op);
                });
        });

        // ------------------------------- PRE-HANDLER ------------------------- //
        server.ext("onPreHandler", async (request, h) => {
            console.log("======> onPreHandler", request.url.pathname);
            try {
                const {
                    [internals.pluginName]: routeOptions = {},
                } = request.route.settings.plugins;
                const username = Utils.getUser(request, options.sidUsernameAttribute);
                const {
                    url: { pathname },
                    method,
                    params,
                } = request;

                /**
                 * skip audit if disabled on route, not within session scope, path does no match criteria
                 * if this will be handled as a custom action skip to process on preResponse
                 */
                console.log("===========> isAuditable", options.isAuditable.toString());
                if (
                    Utils.isDisabled(routeOptions) ||
                    !Utils.isLoggedIn(username) ||
                    !options.isAuditable(pathname, method) ||
                    routeOptions.action ||
                    routeOptions.simpleAction
                ) {
                    return h.continue;
                }

                /**
                 * Ovveride, creates GET endpoint using the value of the specified path param as an id
                 * and the specified path if provided or else the current
                 */
                const customGetPath = (routeOptions.getPath || pathname).replace(
                    new RegExp(/{.*}/, "gi"),
                    params[routeOptions.mapParam]
                );
                const getEndpoint = Utils.toEndpoint("get", pathname, customGetPath);
                const routeEndpoint = Utils.toEndpoint(method, pathname);

                if (Utils.isUpdate(method) || routeOptions.auditAsUpdate) {
                    let oldVals = null;

                    if (!options.disableCache) {
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
                    const { payload } = await internals.fetchValues(request);
                    const originalValues = JSON.parse(payload);
                    oldValsCache.set(getEndpoint, originalValues);
                }
            } catch (error) {
                internals.handleError(options, request, error);
            }

            return h.continue;
        });

        // ------------------------------- PRE-RESPONSE ------------------------- //
        server.ext("onPreResponse", async (request, h) => {
            console.log("===================> onPostHandler", request.url.pathname);
            try {
                const {
                    [internals.pluginName]: routeOptions = {},
                } = request.route.settings.plugins;
                const username = Utils.getUser(request, options.sidUsernameAttribute);
                const {
                    url: { pathname },
                    headers: { injected },
                    method,
                    query,
                    params,
                    payload: reqPayload,
                    response: { source: resp, statusCode },
                } = request;

                // skip audit if disabled on route, not in session, path does not match criteria, call failed
                if (
                    Utils.isDisabled(routeOptions) ||
                    !Utils.isLoggedIn(username) ||
                    !options.isAuditable(pathname, method) ||
                    !Utils.isSuccess(statusCode)
                ) {
                    return h.continue;
                }
                const customGetPath = (routeOptions.getPath || pathname).replace(
                    new RegExp(/{.*}/, "gi"),
                    params[routeOptions.mapParam]
                );
                const createMutation = Utils.initMutation({
                    method,
                    clientId: options.clientId,
                    username,
                    auditAsUpdate: routeOptions.auditAsUpdate,
                });
                const createAction = Utils.initAction({
                    clientId: options.clientId,
                    username,
                });
                const routeEndpoint = Utils.toEndpoint(method, pathname);
                const getEndpoint = Utils.toEndpoint("get", pathname, customGetPath);
                let rec = null;

                if (routeOptions.simpleAction) {
                    rec = createAction({
                        entity: Utils.getEntity(routeOptions.entity, pathname),
                        entityId: Utils.getId(params, routeOptions.id),
                        action: routeOptions.simpleAction,
                        type: routeOptions.eventType,
                    });
                } else if (
                    routeOptions.action &&
                    (Utils.isUpdate(method) || Utils.isCreate(method)) &&
                    !Utils.isStream(reqPayload)
                ) {
                    /**
                     * Override default behaviour. For POST, PUT if user action is specified on route
                     * don't create a mutation but an action instead with the reqPayload data
                     * */
                    rec = createAction({
                        entity: Utils.getEntity(routeOptions.entity, pathname),
                        entityId: Utils.getId(params, routeOptions.id, reqPayload),
                        data: reqPayload,
                        action: routeOptions.action,
                        type: routeOptions.eventType,
                    });
                } else if (Utils.isRead(method) && injected == null) {
                    if (!options.disableCache && !Utils.isStream(resp)) {
                        oldValsCache.set(getEndpoint, resp);
                    }

                    rec = createAction({
                        entity: Utils.getEntity(routeOptions.entity, pathname),
                        entityId: Utils.getId(params, routeOptions.id),
                        action: routeOptions.acion,
                        data: routeOptions.paramsAsData ? params : query,
                    });
                } else if (Utils.isUpdate(method) || routeOptions.auditAsUpdate) {
                    const oldVals = oldValsCache.get(getEndpoint);
                    let newVals = null;

                    // check if proxied to upstream server
                    if (!Utils.isStream(reqPayload)) {
                        newVals = Utils.clone(reqPayload);
                    }

                    if (newVals == null || routeOptions.forceGetAfterUpdate) {
                        const { payload: data } = await internals.fetchValues(
                            request,
                            customGetPath
                        );
                        newVals = JSON.parse(data);
                    }

                    if (routeOptions.diffOnly) {
                        Utils.keepProps(oldVals, newVals, routeOptions.diffOnly);
                    } else {
                        Utils.removeProps(oldVals, newVals, routeOptions.skipDiff);
                    }

                    const [originalValues, newValues] = options.diffFunc(oldVals, newVals);

                    rec = createMutation({
                        entity: Utils.getEntity(routeOptions.entity, pathname),
                        entityId: Utils.getId(params, routeOptions.id, newVals),
                        originalValues,
                        newValues,
                    });

                    oldValsCache.delete(getEndpoint);
                } else if (Utils.isDelete(method)) {
                    const oldVals = oldValsCache.get(getEndpoint);
                    rec = createMutation({
                        entity: Utils.getEntity(routeOptions.entity, pathname),
                        entityId: Utils.getId(params, routeOptions.id, oldVals),
                        originalValues: oldVals,
                    });
                } else if (Utils.isCreate(method)) {
                    if (!Utils.isStream(resp)) {
                        const data = Utils.gotResponseData(resp) ? resp : reqPayload;

                        rec = createMutation({
                            entity: Utils.getEntity(routeOptions.entity, pathname),
                            entityId: Utils.getId(null, routeOptions.id, data),
                            newValues: data,
                        });
                    } else {
                        throw new Error(`Cannot raed streamed response on ${routeEndpoint}`);
                    }
                }

                // skipp auditing of GET requests if enabled, of injected from plugin
                if (Utils.shouldAuditRequest(method, options.auditGetRequests, injected)) {
                    if (rec != null) {
                        server.events.emit(internals.pluginName, rec);
                    } else {
                        throw new Error(
                            `Cannot audit null audit record for endpoint: ${routeEndpoint}`
                        );
                    }
                }
            } catch (error) {
                internals.handleError(options, request, error);
            }

            return h.continue;
        });

        setInterval(() => {
            oldValsCache = new Map();
        }, options.cacheExpiresIn);
    },
};
