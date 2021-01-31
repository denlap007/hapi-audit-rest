import { AUDIT_OUTCOME } from "../enums";

class AuditRecord {
    constructor(data) {
        const { type, body, outcome = AUDIT_OUTCOME.SUCCESS, application } = data;

        this.application = application;
        this.type = type;
        this.body = body;
        this.outcome = outcome;
    }
}

export default AuditRecord;
