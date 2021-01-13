import { AUDIT_TYPE } from "./enums";
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
  isSuccessfulResponse,
  createMutationRecord,
  createActionRecord,
  getEntityId,
} from "./utils";
import validateSchema from "./validations";

exports.plugin = {
  name: "auditing",
  version: "1.0.0",
  async register(server, options) {
    // validate options schema
    validateSchema(options);

    const FIVE_MINS_MSECS = 300000;
    const ID_PARAM_DEFAULT = "id";
    const {
      disableOnRoutes, // TODO
      showErrorsOnStdErr = true,
      diffFunc = () => [{}, {}],
      skipDiffForEndpointProps = {},
      disableCache = false,
      clientId = "client-app",
      sidUsernameAttribute = "userName",
      emitEventName = "auditing",
      cacheExpiresIn = FIVE_MINS_MSECS,
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

    server.ext("onPreHandler", async (request, h) => {
      try {
        const { [this.name]: auditing = {} } = request.route.settings.plugins;
        // route specific auditing options
        const {
          action,
          entity,
          entityKeys,
          idParam = ID_PARAM_DEFAULT,
          getPath,
          getPathId,
        } = auditing;

        const username = request.auth.isAuthenticated
          ? request.auth.credentials[sidUsernameAttribute]
          : null;

        const {
          url: { pathname },
          method,
          query,
          params,
          payload,
          route: { path: routPath },
        } = request;

        /**
         * skip audit if disabled on route
         * skip audit if not within session scope
         * skip audit if path does no match criteria
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

        const id = params[idParam];
        const getEndpoint = toEndpoint("get", routPath, getPath);
        const routeEndpoint = toEndpoint(method, routPath);

        const fetchOldVals = async () => {
          //   console.log("-------- FETCHED from API --------");
          //   console.log("-------- getEndpoint ", `${getEndpoint}`);
          //   console.log("-------- params ", params);
          const {
            settings: { handler = async () => Promise.resolve(null) } = {},
          } =
            server
              .table()
              .find(
                ({ method, path }) => toEndpoint(method, path) === getEndpoint
              ) || {};

          // param name in get endpoint matches the current
          if (getEndpoint.includes(idParam)) {
            request.params[idParam] = params[idParam];
          } else if (getPathId) {
            request.params[getPathId] = params[idParam];
          } else {
            throw new Error(
              `Path param missmatch for data fetch endpoint ${getEndpoint} while updating ${routeEndpoint}. Use attribute 'getPathId'`
            );
          }
          return handler(request, h);
        };

        if (isUpdate(method)) {
          let oldVals = null;
          const newVals = clone(payload);

          if (!disableCache) {
            oldVals = oldValsCache.get(getEndpoint);
          }
          // if null or cache undefined
          if (oldVals == null) {
            oldVals = await fetchOldVals(getEndpoint);
          } else {
            // console.log("=======> FOUND IN CACHE <========");
            // delete oldValsCache key-value due to update
            oldValsCache.delete(getEndpoint);
          }

          if (oldVals === null) {
            throw new Error(
              `Cannot get data before update on ${routeEndpoint}`
            );
          }

          (skipDiffForEndpointProps[routeEndpoint] || []).forEach((key) => {
            delete oldVals[key];
            delete newVals[key];
          });
          // console.log("===> oldVals", JSON.stringify(oldVals, null, 4));
          // console.log("===> newVals", JSON.stringify(newVals, null, 4));

          const [originalValues, newValues] = diffFunc(oldVals, newVals);

          const rec = createMutationRecord({
            method,
            clientId,
            entity: getEntity(entity, pathname),
            entityId: getEntityId(entityKeys, id, newValues),
            username,
            originalValues,
            newValues,
          });

          // save to oldValsCache to emit on success
          auditValues.set(routeEndpoint, rec);
        } else if (isDelete(method)) {
          const originalValues = await fetchOldVals(getEndpoint);
          const rec = createMutationRecord({
            method,
            clientId,
            entity: getEntity(entity, pathname),
            entityId: getEntityId(entityKeys, id, originalValues),
            username,
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

    server.ext("onPreResponse", (request, h) => {
      try {
        const { [this.name]: auditing = {} } = request.route.settings.plugins;
        // route specific auditing options
        const {
          action,
          entity,
          entityKeys,
          idParam = ID_PARAM_DEFAULT,
        } = auditing;

        const username = request.auth.isAuthenticated
          ? request.auth.credentials[sidUsernameAttribute]
          : null;

        const {
          url: { pathname },
          method,
          query,
          params,
          payload,
          response: { source, statusCode },
          route: { path: routPath },
        } = request;

        /**
         * skip audit if disabled on route
         * skip audit if not within session scope
         * skip audit if path does no match criteria
         */
        if (
          isDisabled(auditing) ||
          !isLoggedIn(username) ||
          !isAuditable(pathname, method)
        ) {
          return h.continue;
        }

        const routeEndpoint = toEndpoint(method, routPath);
        let rec = null;

        /**
         * Override default behaviour. For POST, PUT if user action is specified on route
         * don't create a mutation but an action instead with the payload data
         * */
        if (
          action &&
          (isUpdate(method) || isCreate(method)) &&
          isSuccessfulResponse(statusCode)
        ) {
          const id = params[idParam] || payload[idParam];

          rec = createActionRecord({
            clientId,
            entity: getEntity(entity, pathname),
            entityId: getEntityId(entityKeys, id),
            username,
            data: payload,
            action,
            type: action,
          });
        }

        if (isRead(method) && isSuccessfulResponse(statusCode)) {
          const id = params[idParam];

          if (id && !disableCache) {
            oldValsCache.set(routeEndpoint, source);
          }

          rec = createActionRecord({
            clientId,
            entity: getEntity(entity, pathname),
            entityId: getEntityId(entityKeys, id),
            username,
            data: query,
            action: (action && action.toUpperCase()) || AUDIT_TYPE.SEARCH,
          });
        } else if (
          (isUpdate(method) || isDelete(method)) &&
          isSuccessfulResponse(statusCode)
        ) {
          rec = auditValues.get(routeEndpoint);
        } else if (isCreate(method) && isSuccessfulResponse(statusCode)) {
          const id = payload[idParam];

          rec = createMutationRecord({
            method,
            clientId,
            entity: getEntity(entity, pathname),
            entityId: getEntityId(entityKeys, id, payload),
            username,
            newValues: payload,
          });
        }

        emitAuditEvent(rec, routeEndpoint);
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
