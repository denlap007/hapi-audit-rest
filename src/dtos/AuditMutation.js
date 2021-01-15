import { AUDIT_OUTCOME, AUDIT_TYPE, AUDIT_ACTION } from "../enums";
import AuditMutationBody from "./AuditMutationBody";

class AuditMutation {
  constructor(input) {
    const {
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
    let httpAction = null;

    if (!action && `${method}`.toLowerCase() === "put") {
      httpAction = AUDIT_ACTION.MUTATION_UPDATE;
    } else if (!action && `${method}`.toLowerCase() === "post") {
      httpAction = AUDIT_ACTION.MUTATION_CREATE;
    } else if (!action && `${method}`.toLowerCase() === "delete") {
      httpAction = AUDIT_ACTION.MUTATION_DELETE;
    }

    this.application = application;
    this.type = AUDIT_TYPE.MUTATION;
    this.body = new AuditMutationBody({
      entity,
      action: action || httpAction,
      entityId,
      username,
      originalValues,
      newValues,
    });
    this.outcome = outcome;
  }
}

export default AuditMutation;
