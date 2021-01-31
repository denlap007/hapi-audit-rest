import stream from "stream";

import AuditAction from "./dtos/AuditAction";
import AuditMutation from "./dtos/AuditMutation";

export default {
    clone: (obj) => JSON.parse(JSON.stringify(obj)),
    isRead: (method) => method === "get",
    isCreate: (method) => method === "post",
    isUpdate: (method) => method === "put",
    isDelete: (method) => method === "delete",
    isDisabled: (auditing) => auditing === false,
    isLoggedIn: (username) => username != null,
    getEntity: (definedEntity, path) => {
        if (definedEntity) return definedEntity;

        if (typeof path === "string") {
            let entity = "";

            if (path.startsWith("/api")) {
                entity = path.split("/")[2];
            }

            if (!entity) {
                throw new Error(`[getEntity] ERROR: Could not extract entity for path: ${path}`);
            }

            return entity;
        }
        throw new Error(
            `[getEntity] ERROR: Expected path to be of type string and instead got: ${typeof path}`
        );
    },
    toEndpoint: (method, path, getPath) => (getPath ? `${method}:${getPath}` : `${method}:${path}`),
    isSuccess: (code) =>
        Number.isInteger(code) && parseInt(code, 10) >= 200 && parseInt(code, 10) <= 299,
    initMutation: ({ method: httpVerb, clientId, username, auditAsUpdate }) => ({
        entity,
        entityId,
        originalValues,
        newValues,
    }) => {
        const method = auditAsUpdate ? "PUT" : httpVerb;

        return new AuditMutation({
            method,
            application: clientId,
            entity,
            entityId,
            username,
            originalValues,
            newValues,
        });
    },
    initAction: ({ clientId, username }) => ({ entity, entityId, data, action, type }) =>
        new AuditAction({
            application: clientId,
            type,
            entity,
            entityId,
            username,
            data,
            action,
        }),
    gotResponseData: (data) => data != null,
    shouldAuditRequest: (method, auditGetRequests, injected) =>
        injected == null && ((method === "get" && auditGetRequests) || method !== "get"),
    removeProps: (left, right, props) => {
        if (Array.isArray(props)) {
            props.forEach((key) => {
                delete left[key];
                delete right[key];
            });
        } else if (props != null) {
            throw new Error(
                `Invalid type for option: [skipDiff]. Expected array got ${typeof props}`
            );
        }
        return [left, right];
    },
    isStream: (input) => input instanceof stream.Readable,
    getUser: (req, sidUsernameAttribute) =>
        req.auth.isAuthenticated ? req.auth.credentials[sidUsernameAttribute] : null,

    keepProps: (left, right, props) => {
        if (props != null && Array.isArray(props)) {
            [...new Set([Object.keys(left), Object.keys(right)].flat())].forEach((key) => {
                if (!props.includes(key)) {
                    delete left[key];
                    delete right[key];
                }
            });
        } else {
            throw new Error(
                `Invalid type for option: [diffOnly]. Expected array got ${typeof props}`
            );
        }

        return [left, right];
    },
    checkOldVals: (oldVals, routeEndpoint) => {
        if (oldVals == null) {
            throw new Error(`Cannot get data before update on ${routeEndpoint}`);
        }
    },
    getId: (params, id, payload) => {
        const DEFAULT_ID = "id";
        let { keys, source } = id || {};
        let data = params;

        if (source === "payload") {
            data = payload;
        }

        if (keys == null) {
            keys = [DEFAULT_ID];
        }

        return keys.reduce((acc, key, idx, arr) => {
            const val = data[key];
            // when only id is provided, do not be verbose
            if (arr.length === 1 && key === DEFAULT_ID) {
                return val;
            }

            return acc === "" ? `${key}: ${val}` : `${acc}, ${key}: ${val}`;
        }, "");
    },
};
