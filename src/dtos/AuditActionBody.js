import { AUDIT_OUTCOME } from "../enums";

class AuditActionBody {
  constructor(input) {
    const {
      entity,
      entityId,
      action,
      username,
      timestamp = new Date(),
      data = {},
      outcome = AUDIT_OUTCOME.SUCCESS,
    } = input;

    this.entity = entity;
    this.entityId = entityId;
    this.action = action;
    this.username = username;
    this.outcome = outcome;
    this.timestamp = timestamp;
    this.data = data;
  }
}

export default AuditActionBody;
