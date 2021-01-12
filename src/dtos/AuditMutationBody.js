class AuditMutationBody {
  constructor(input) {
    const {
      entity,
      entityId,
      action,
      username,
      originalValues = {},
      newValues = {},
      timestamp = new Date(),
      data = {},
    } = input;

    this.entity = entity;
    this.entityId = entityId;
    this.action = action;
    this.username = username;
    this.originalValues = originalValues;
    this.newValues = newValues;
    this.timestamp = timestamp;
    this.data = data;
  }
}

export default AuditMutationBody;
