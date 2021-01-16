import stream from "stream";

import AuditAction from "./dtos/AuditAction";
import AuditMutation from "./dtos/AuditMutation";

export const clone = (obj) => JSON.parse(JSON.stringify(obj));

export const isRead = (method) => method.toLowerCase() === "get";

export const isCreate = (method) => method.toLowerCase() === "post";

export const isUpdate = (method) => method.toLowerCase() === "put";

export const isDelete = (method) => method.toLowerCase() === "delete";

export const isDisabled = (auditing) =>
  typeof auditing === "boolean" && !auditing;

export const isLoggedIn = (username) => username != null;

export const getEntity = (extEntity, path) => {
  if (extEntity) return extEntity;

  if (typeof path === "string") {
    let entity = "";

    if (path.startsWith("/api")) {
      entity = path.split("/")[2];
    }

    if (!entity) {
      throw new Error(
        `[getEntity] ERROR: Could not extract entity for path: ${path}`
      );
    }

    return entity;
  }
  throw new Error(
    `[getEntity] ERROR: Expected path parm to be of type string and instead got: ${typeof path}`
  );
};

export const toEndpoint = (method, path, getPath) =>
  getPath ? `${method}:${getPath}` : `${method}:${path}`;

// Successful responses (200–299),
export const isSuccessfulResponse = (code) =>
  Number.isInteger(code) &&
  parseInt(code, 10) >= 200 &&
  parseInt(code, 10) <= 299;

export const initMutation = ({
  method: httpVerb,
  clientId,
  username,
  simulateUpdate,
}) => ({ entity, entityId, originalValues, newValues }) => {
  const method = simulateUpdate ? "PUT" : httpVerb;

  return new AuditMutation({
    method,
    application: clientId,
    entity,
    entityId,
    username,
    originalValues,
    newValues,
  });
};

export const initAction = ({ clientId, username }) => ({
  entity,
  entityId,
  data,
  action,
  type,
}) =>
  new AuditAction({
    application: clientId,
    type,
    entity,
    entityId,
    username,
    data,
    action,
  });

export const getEntityId = (entityKeys, id, data) => {
  let entityId = "";

  if (entityKeys) {
    entityId = entityKeys.reduce((acc, key) => {
      const val = data[key];
      return acc === "" ? `${key}: ${val}` : `${acc}, ${key}: ${val}`;
    }, "");
  } else {
    entityId = id;
  }

  return entityId;
};

export const gotResponseData = (data) => data != null;

export const shouldAuditRequest = (method, auditGetRequests, injected) =>
  injected == null &&
  ((method.toLowerCase() === "get" && auditGetRequests) ||
    method.toLowerCase() !== "get");

export const removeProps = (left, right, props) => {
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
};

export const isStream = (input) => input instanceof stream.Readable;

export const getUser = (req, sidUsernameAttribute) =>
  req.auth.isAuthenticated ? req.auth.credentials[sidUsernameAttribute] : null;

export const keepProps = (left, right, props) => {
  if (props != null && Array.isArray(props)) {
    [...new Set([Object.keys(left), Object.keys(right)].flat())].forEach(
      (key) => {
        if (!props.includes(key)) {
          delete left[key];
          delete right[key];
        }
      }
    );
  } else {
    throw new Error(
      `Invalid type for option: [diffOnly]. Expected array got ${typeof props}`
    );
  }

  return [left, right];
};
