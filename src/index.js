import {
  clone,
  isRead,
  isCreate,
  isUpdate,
  isDelete,
  isDisabled,
  isLoggedIn,
  getEntity,
  toEndpoint,
  success,
  initMutation,
  initAction,
  getEntityId,
  gotResponseData,
  shouldAuditRequest,
  removeProps,
  isStream,
  getUser,
  keepProps,
  checkOldVals,
} from "./utils";
import validateSchema from "./validations";

exports.plugin = {
  requirements: {
    hapi: ">=17.0.0",
  },
  name: "hapi-audit-rest",
  version: "1.12.0",
  async register(server, options) {
    // validate options schema
    validateSchema(options);

    const FIFTEEN_MINS_MSECS = 900000;
    const ID_PARAM_DEFAULT = "id";
    const {
      disableOnRoutes, // TODO
      auditGetRequests = true,
      showErrorsOnStdErr = true,
      diffFunc = () => [{}, {}],
      disableCache = false,
      clientId = "client-app",
      sidUsernameAttribute = "userName",
      emitEventName = "auditing",
      cacheExpiresIn = FIFTEEN_MINS_MSECS,
      isAuditable = (path, method) => path.startsWith("/api"),
      eventHanler = (data) => {
        console.log("Emitted Audit Record", JSON.stringify(data, null, 4));
      },
    } = options;

    // initialize caches
    let oldValsCache = new Map();
    const auditValues = new Map();

    // register event
    server.event(emitEventName);

    // register event handler
    server.events.on(emitEventName, eventHanler);

    const handleError = (request, error) => {
      if (showErrorsOnStdErr) {
        console.error(`[${this.name}] =======> ERROR: ${error.message}`);
      }
      request.log(["error", "auditing-error"], error.message);
    };

    const emitAuditEvent = (rec, routeEndpoint) => {
      if (rec != null) {
        server.events.emit(emitEventName, rec);

        // clear cached data, necessary only on put
        auditValues.delete(routeEndpoint);
      } else {
        throw new Error(
          `Cannot audit null audit record for endpoint: ${routeEndpoint}`
        );
      }
    };

    const fetchValues = async (
      { headers, auth, url: { pathname } },
      customGetPath
    ) =>
      server.inject({
        method: "GET",
        url: customGetPath || pathname,
        headers: { ...headers, injected: "true" },
        auth,
      });

    // ------------------------------- PRE-HANDLER ------------------------- //
    server.ext("onPreHandler", async (request, h) => {
      try {
        const { [this.name]: auditing = {} } = request.route.settings.plugins;
        // route specific auditing options
        const {
          action,
          entity,
          entityKeys,
          idParam = ID_PARAM_DEFAULT,
          skipDiff,
          auditAsUpdate,
          diffOnly,
          getPath,
          mapParam,
          forceGetAfterUpdate,
        } = auditing;

        const username = getUser(request, sidUsernameAttribute);

        const {
          url: { pathname },
          method,
          params,
          payload,
        } = request;

        /**
         * skip audit if disabled on route, not within session scope, path does no match criteria
         * if this will be handled as a custom action skip to process on preResponse
         */
        if (
          isDisabled(auditing) ||
          !isLoggedIn(username) ||
          !isAuditable(pathname, method) ||
          action
        ) {
          return h.continue;
        }
        /**
         * Ovveride, creates GET endpoint using the value of the specified path param as an id
         * and the specified path if provided or else the current
         */
        const customGetPath = (getPath || pathname).replace(
          new RegExp(/{.*}/, "gi"),
          params[mapParam]
        );
        const createMutation = initMutation({
          method,
          clientId,
          username,
          auditAsUpdate,
        });
        const id = params[idParam];
        const getEndpoint = toEndpoint("get", pathname, customGetPath);
        const routeEndpoint = toEndpoint(method, pathname);

        if (isUpdate(method) || auditAsUpdate || forceGetAfterUpdate) {
          let oldVals = null;
          let newVals = null;
          let isProxy = false;

          // check if proxied to upstream server
          if (isStream(payload)) {
            isProxy = true;
          } else {
            newVals = clone(payload);
          }

          if (!disableCache) {
            oldVals = oldValsCache.get(getEndpoint);
          }

          // if null or cache undefined
          if (oldVals == null) {
            const { payload: data } = await fetchValues(request, customGetPath);
            oldVals = JSON.parse(data);
          } else {
            // evict key due to update
            oldValsCache.delete(getEndpoint);
          }

          checkOldVals(oldVals, routeEndpoint);

          if (isProxy || auditAsUpdate || forceGetAfterUpdate) {
            oldValsCache.set(getEndpoint, oldVals);
            return h.continue;
          }

          if (diffOnly) {
            keepProps(oldVals, newVals, diffOnly);
          } else {
            removeProps(oldVals, newVals, skipDiff);
          }

          const [originalValues, newValues] = diffFunc(oldVals, newVals);

          const rec = createMutation({
            entity: getEntity(entity, pathname),
            entityId: getEntityId(entityKeys, id, newVals),
            originalValues,
            newValues,
          });

          // save to oldValsCache to emit on success
          auditValues.set(routeEndpoint, rec);
        } else if (isDelete(method)) {
          const { payload: originalValues } = await fetchValues(request);

          const rec = createMutation({
            entity: getEntity(entity, pathname),
            entityId: getEntityId(entityKeys, id, originalValues),
            originalValues,
          });

          // save to oldValsCache to emit on success
          auditValues.set(routeEndpoint, rec);
        }
      } catch (error) {
        handleError(request, error);
      }

      return h.continue;
    });

    // ------------------------------- PRE-RESPONSE ------------------------- //
    server.ext("onPreResponse", async (request, h) => {
      try {
        const { [this.name]: auditing = {} } = request.route.settings.plugins;
        // route specific auditing options
        const {
          action,
          type,
          entity,
          entityKeys,
          idParam = ID_PARAM_DEFAULT,
          skipDiff,
          auditAsUpdate,
          diffOnly,
          getPath,
          mapParam,
          paramsAsData,
        } = auditing;

        const username = getUser(request, sidUsernameAttribute);

        const {
          url: { pathname },
          headers: { injected },
          method,
          query,
          params,
          payload: reqPayload,
          response,
        } = request;
        const { resp, statusCode } = response;

        // skip audit if disabled on route, not within session scope, path does no match criteria
        if (
          isDisabled(auditing) ||
          !isLoggedIn(username) ||
          !isAuditable(pathname, method)
        ) {
          return h.continue;
        }
        const customGetPath = (getPath || pathname).replace(
          new RegExp(/{.*}/, "gi"),
          params[mapParam]
        );
        const createMutation = initMutation({
          method,
          clientId,
          username,
          auditAsUpdate,
        });
        const createAction = initAction({ clientId, username });
        const routeEndpoint = toEndpoint(method, pathname);
        const getEndpoint = toEndpoint("get", pathname, customGetPath);
        let rec = null;

        /**
         * Override default behaviour. For POST, PUT if user action is specified on route
         * don't create a mutation but an action instead with the reqPayload data
         * */
        if (
          action &&
          (isUpdate(method) || isCreate(method)) &&
          success(statusCode) &&
          !isStream(reqPayload)
        ) {
          const id = params[idParam] || reqPayload[idParam];

          rec = createAction({
            entity: getEntity(entity, pathname),
            entityId: getEntityId(entityKeys, id, reqPayload),
            data: reqPayload,
            action,
            type,
          });
        } else if (isRead(method) && success(statusCode) && injected == null) {
          const id = params[idParam];

          if (id && !disableCache && !isStream(resp)) {
            oldValsCache.set(getEndpoint, resp);
          }

          rec = createAction({
            entity: getEntity(entity, pathname),
            entityId: getEntityId(entityKeys, id, params),
            action,
            data: paramsAsData ? params : query,
          });
        } else if ((isUpdate(method) || auditAsUpdate) && success(statusCode)) {
          const id = params[idParam];
          const oldVals = oldValsCache.get(getEndpoint);
          rec = auditValues.get(routeEndpoint);

          // if a record was created audit it, else fetch new vals and create it
          if (rec == null) {
            checkOldVals(oldVals, routeEndpoint);

            const { payload: data } = await fetchValues(request, customGetPath);
            const newVals = JSON.parse(data);

            if (diffOnly) {
              keepProps(oldVals, newVals, diffOnly);
            } else {
              removeProps(oldVals, newVals, skipDiff);
            }

            const [originalValues, newValues] = diffFunc(oldVals, newVals);

            rec = createMutation({
              entity: getEntity(entity, pathname),
              entityId: getEntityId(entityKeys, id, newVals),
              originalValues,
              newValues,
            });

            oldValsCache.delete(getEndpoint);
          }
        } else if (isDelete(method) && success(statusCode)) {
          rec = auditValues.get(routeEndpoint);
        } else if (isCreate(method) && success(statusCode)) {
          const id = gotResponseData(resp)
            ? resp[idParam]
            : reqPayload[idParam];

          if (!isStream(resp)) {
            const data = gotResponseData(resp) ? resp : reqPayload;

            rec = createMutation({
              entity: getEntity(entity, pathname),
              entityId: getEntityId(entityKeys, id, data),
              newValues: data,
            });
          } else {
            throw new Error(
              `Cannot raed streamed response on ${routeEndpoint}`
            );
          }
        }

        // skipp auditing of GET requests if enabled, of injected from plugin
        if (shouldAuditRequest(method, auditGetRequests, injected)) {
          emitAuditEvent(rec, routeEndpoint);
        }
      } catch (error) {
        handleError(request, error);
      }

      return h.continue;
    });

    setInterval(() => {
      oldValsCache = new Map();
    }, cacheExpiresIn);
  },
};
