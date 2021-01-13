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

export const createMutationRecord = ({
  method,
  clientId,
  entity,
  entityId,
  username,
  originalValues,
  newValues,
}) =>
  new AuditMutation({
    method,
    application: clientId,
    entity,
    entityId,
    username,
    originalValues,
    newValues,
  });

export const createActionRecord = ({
  clientId,
  entity,
  entityId,
  username,
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
