import { AUDIT_OUTCOME, AUDIT_TYPE, AUDIT_ACTION } from "../enums";
import AuditMutationBody from "./AuditMutationBody";

class AuditMutation {
  constructor(input) {
    let {
      method,
      action,
      entity,
      entityId,
      username,
      outcome = AUDIT_OUTCOME.SUCCESS,
      application,
      originalValues = {},
      newValues = {},
    } = input;

    if (!action && `${method}`.toLowerCase() === "put") {
      action = AUDIT_ACTION.MUTATION_UPDATE;
    } else if (!action && `${method}`.toLowerCase() === "post") {
      action = AUDIT_ACTION.MUTATION_CREATE;
    } else if (!action && `${method}`.toLowerCase() === "delete") {
      action = AUDIT_ACTION.MUTATION_DELETE;
    }

    this.application = application;
    this.type = AUDIT_TYPE.MUTATION;
    this.body = new AuditMutationBody({
      entity,
      action,
      entityId,
      username,
      originalValues,
      newValues,
    });
    this.outcome = outcome;
  }
}

export default AuditMutation;
