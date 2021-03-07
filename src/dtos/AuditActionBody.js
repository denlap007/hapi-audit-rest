class AuditActionBody {
    constructor(input) {
        const { entity, entityId, action, username, timestamp = new Date(), data } = input;

        this.entity = entity;
        this.entityId = entityId;
        this.action = action;
        this.username = username;
        this.timestamp = timestamp;
        this.data = data;
    }
}

export default AuditActionBody;
