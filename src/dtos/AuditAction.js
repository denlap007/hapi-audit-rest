import { AUDIT_OUTCOME, EVENT_TYPE } from "../enums";
import AuditActionBody from "./AuditActionBody";

class AuditAction {
  constructor(input) {
    const {
      type = EVENT_TYPE.SEARCH,
      entity,
      entityId,
      action,
      username,
      data = {},
      outcome = AUDIT_OUTCOME.SUCCESS,
      application,
    } = input;

    this.application = application;
    this.type = type;
    this.body = new AuditActionBody({
      entity,
      entityId,
      action,
      username,
      data,
    });
    this.outcome = outcome;
  }
}

export default AuditAction;
