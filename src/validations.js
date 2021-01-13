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
    skipDiffForEndpointProps,
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

  // object
  if (
    isDefined(skipDiffForEndpointProps) &&
    !(
      typeof skipDiffForEndpointProps === "object" &&
      skipDiffForEndpointProps !== null &&
      !Array.isArray(skipDiffForEndpointProps)
    )
  ) {
    throwTypeError(
      "skipDiffForEndpointProps",
      "object",
      skipDiffForEndpointProps
    );
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

  // format
  if (
    skipDiffForEndpointProps != null &&
    Object.values(skipDiffForEndpointProps).some((val) => !Array.isArray(val))
  ) {
    throw new Error(
      "Invalid type. All values of field 'skipDiffForEndpointProps' must be of type Array"
    );
  }
};
