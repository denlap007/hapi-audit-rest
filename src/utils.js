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
    hasAuth: (req) => req.auth.isAuthenticated,
    toEndpoint: (method, path, getPath) => (getPath ? `${method}:${getPath}` : `${method}:${path}`),
    isSuccess: (code) =>
        Number.isInteger(code) && parseInt(code, 10) >= 200 && parseInt(code, 10) <= 299,
    initMutation: ({ method: httpVerb, clientId, username, auditAsUpdate }) => ({
        entity,
        entityId,
        action,
        originalValues,
        newValues,
    }) => {
        const method = auditAsUpdate ? "PUT" : httpVerb;

        return new AuditMutation({
            method,
            application: clientId,
            entity,
            entityId,
            action,
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
    getUser: (req, usernameKey) => req.auth?.credentials[usernameKey] || null,
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
    getId: (params, payload) => {
        const data = params || payload;
        const DEFAULT_ID = "id";

        return data[DEFAULT_ID];
    },
};
