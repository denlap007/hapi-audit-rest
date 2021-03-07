import { AUDIT_OUTCOME, EVENT_TYPE } from "../enums";
import AuditActionBody from "./AuditActionBody";

class AuditAction {
    constructor(input) {
        const {
            type = EVENT_TYPE.SEARCH,
            entity,
            entityId = null,
            action = EVENT_TYPE.SEARCH,
            username,
            data = null,
            outcome = AUDIT_OUTCOME.SUCCESS,
            application,
        } = input;

        this.application = application;
        this.type = type;
        this.body = new AuditActionBody({
            entity,
            entityId,
            action: `${action}`.toUpperCase(),
            username,
            data,
        });
        this.outcome = outcome;
    }
}

export default AuditAction;
