import stream from "stream";

import AuditAction from "./dtos/AuditAction";
import AuditMutation from "./dtos/AuditMutation";

const isObject = (val) => typeof val === "object" && val !== null;

const ONE_MINUTE_MSECS = 60 * 1000;
const DEFAULT_ID = "id";

export default {
    clone: (obj) => JSON.parse(JSON.stringify(obj)),
    isRead: (method) => method === "get",
    isCreate: (method) => method === "post",
    isUpdate: (method) => method === "put",
    isDelete: (method) => method === "delete",
    isEnabled: (auditing) => auditing !== false,
    toEndpoint: (method, path, getPath) => (getPath ? `${method}:${getPath}` : `${method}:${path}`),
    isSuccess: (code) =>
        Number.isInteger(code) && parseInt(code, 10) >= 200 && parseInt(code, 10) <= 299,
    initMutation:
        ({ method, clientId, username }) =>
        ({ entity, entityId, action, originalValues, newValues }) =>
            new AuditMutation({
                method,
                application: clientId,
                entity,
                entityId,
                action,
                username,
                originalValues,
                newValues,
            }),
    initAction:
        ({ clientId, username }) =>
        ({ entity, entityId, data, action, type }) =>
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
    removeProps: (left, right, props) => {
        if (Array.isArray(props) && isObject(left) && isObject(right)) {
            props.forEach((key) => {
                delete left[key];
                delete right[key];
            });
        }

        return [left, right];
    },
    isStream: (input) => input instanceof stream.Readable,
    getUser: (req, usernameKey) => req.auth?.credentials?.[usernameKey] ?? null,
    keepProps: (left, right, props) => {
        if (Array.isArray(props) && isObject(left) && isObject(right)) {
            [...new Set([Object.keys(left), Object.keys(right)].flat())].forEach((key) => {
                if (!props.includes(key)) {
                    delete left[key];
                    delete right[key];
                }
            });
        }

        return [left, right];
    },
    getId: (params, payload) => {
        const data = params || payload || {};

        return data[DEFAULT_ID];
    },
    ValuesCache: class MyMap extends Map {
        set(...args) {
            const now = Date.now();

            super.set(...[`${now}::${args[0]}`, null]);
            return super.set(...args);
        }

        clear() {
            const now = Date.now();

            super.forEach((v, k) => {
                const [insertTime, key] = k.split("::");

                if (insertTime && now - insertTime > ONE_MINUTE_MSECS) {
                    super.delete(k);
                    super.delete(key);
                }
            });
        }
    },
};
