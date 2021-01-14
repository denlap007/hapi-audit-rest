const throwTypeError = (instance, schemaType, providedType) => {
  throw new Error(
    `Inalid options schema. Expected '${schemaType}' for ${instance}. Instead got '${providedType}'`
  );
};

const throwMandatoryError = (instance) => {
  throw new Error(`Missing mandatory field '${instance}'`);
};

const isDefined = (arg) => arg !== undefined;

export default (options) => {
  const {
    // disableOnRoutes,
    showErrorsOnStdErr,
    diffFunc,
    disableCache,
    clientId,
    sidUsernameAttribute,
    emitEventName,
    cacheExpiresIn,
    isAuditable,
    eventHanler,
    auditGetRequests,
  } = options;

  // booleans
  if (
    isDefined(showErrorsOnStdErr) &&
    typeof showErrorsOnStdErr !== "boolean"
  ) {
    throwTypeError("showErrorsOnStdErr", "boolean", typeof showErrorsOnStdErr);
  }
  if (isDefined(disableCache) && typeof disableCache !== "boolean") {
    throwTypeError("disableCache", "boolean", typeof disableCache);
  }
  if (isDefined(auditGetRequests) && typeof auditGetRequests !== "boolean") {
    throwTypeError("auditGetRequests", "boolean", typeof auditGetRequests);
  }

  // strings
  if (isDefined(clientId) && typeof clientId !== "string") {
    throwTypeError("clientId", "string", typeof clientId);
  }

  if (
    isDefined(sidUsernameAttribute) &&
    typeof sidUsernameAttribute !== "string"
  ) {
    throwTypeError(
      "sidUsernameAttribute",
      "string",
      typeof sidUsernameAttribute
    );
  }

  if (isDefined(emitEventName) && typeof emitEventName !== "string") {
    throwTypeError("emitEventName", "string", typeof emitEventName);
  }

  // numbers
  if (isDefined(cacheExpiresIn) && typeof cacheExpiresIn !== "number") {
    throwTypeError("cacheExpiresIn", "number", typeof cacheExpiresIn);
  }

  // functions
  if (isDefined(diffFunc) && typeof diffFunc !== "function") {
    throwTypeError("diffFunc", "function", typeof diffFunc);
  }
  if (isDefined(isAuditable) && typeof isAuditable !== "function") {
    throwTypeError("isAuditable", "function", typeof isAuditable);
  }
  if (isDefined(eventHanler) && typeof diffFunc !== "function") {
    throwTypeError("diffFunc", "function", typeof diffFunc);
  }

  // mandatory
  if (diffFunc == null) {
    throwMandatoryError("diffFunc");
  } else if (clientId == null) {
    throwMandatoryError("clientId");
  } else if (emitEventName == null) {
    throwMandatoryError("emitEventName");
  } else if (eventHanler == null) {
    throwMandatoryError("eventHanler");
  }
};
