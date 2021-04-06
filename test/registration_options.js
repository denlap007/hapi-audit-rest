const Hapi = require("@hapi/hapi");
const Lab = require("@hapi/lab");
const { expect } = require("@hapi/code");

const plugin = require("../lib/index");

const { describe, it, before, after, afterEach, beforeEach } = (exports.lab = Lab.script());

describe("Registration settings", () => {
    let server = null;
    let auditError = null;
    let auditEvent = null;

    beforeEach(async () => {
        server = Hapi.server();

        server.events.on({ name: "request", channels: "app" }, (request, event, tags) => {
            if (tags.error && tags["hapi-audit-rest"]) {
                auditError = event;
            }
        });
    });

    afterEach(() => {
        auditError = null;
        auditEvent = null;
        server = null;
    });

    it("does not audit GET requests when auditGetRequests disabled", async () => {
        await server.register({
            plugin,
            options: {
                auditGetRequests: false,
            },
        });

        server.events.on("hapi-audit-rest", ({ auditLog }) => {
            auditEvent = auditLog;
        });

        server.route({
            method: "GET",
            path: "/api/test",
            handler: (request, h) => "OK",
        });

        const res = await server.inject({
            method: "get",
            url: "/api/test",
        });

        expect(res.statusCode).to.equal(200);
        expect(auditError).to.be.null();
        expect(auditEvent).be.null();
    });

    it("does not audit requests when auditable returns false", async () => {
        await server.register({
            plugin,
            options: {
                isAuditable: (path, method) => false,
            },
        });

        server.events.on("hapi-audit-rest", ({ auditLog }) => {
            auditEvent = auditLog;
        });

        server.route({
            method: "GET",
            path: "/api/test",
            handler: (request, h) => "OK",
        });

        const res = await server.inject({
            method: "get",
            url: "/api/test",
        });

        expect(res.statusCode).to.equal(200);
        expect(auditError).to.be.null();
        expect(auditEvent).be.null();
    });

    it("does not use internal cache to fetch old values when disabled", async (flags) => {
        await server.register({
            plugin,
            options: {
                // override default so that audit logs are not printed
                eventHandler: (data) => {},
                cacheEnabled: false,
            },
        });

        server.events.on("hapi-audit-rest", ({ auditLog }) => {
            auditEvent = auditLog;
        });

        const oldVals = { data: "old vals" };
        const newVals = { data: "new vals" };

        const getHandler = (request, h) => oldVals;
        // 1 call injected below and 1 call automatically injected because cache is disabled
        const wrapped = flags.mustCall(getHandler, 2);

        server.route({
            method: "GET",
            path: "/api/test/{id}",
            handler: wrapped,
        });

        server.route({
            method: "PUT",
            path: "/api/test/{id}",
            handler: (request, h) => "OK",
        });

        // would enable caching of oldValues
        await server.inject({
            method: "get",
            url: "/api/test/5",
        });

        const res = await server.inject({
            method: "put",
            url: "/api/test/5",
            payload: newVals,
        });

        expect(res.statusCode).to.equal(200);
        expect(auditError).to.be.null();
        expect(auditEvent).to.not.be.null();
    });

    it("propagates correctly the spedified clientId", async () => {
        const clientId = "test-client-id";

        await server.register({
            plugin,
            options: {
                // override default so that audit logs are not printed
                eventHandler: (data) => {},
                clientId,
            },
        });

        server.events.on("hapi-audit-rest", ({ auditLog }) => {
            auditEvent = auditLog;
        });

        server.route({
            method: "GET",
            path: "/api/test/{id}",
            handler: (request, h) => "OK",
        });

        const res = await server.inject({
            method: "get",
            url: "/api/test/5",
        });

        expect(res.statusCode).to.equal(200);
        expect(auditError).to.be.null();
        expect(auditEvent).to.equal({
            application: clientId,
            type: "SEARCH",
            body: {
                entity: "test",
                entityId: "5",
                action: "SEARCH",
                username: null,
                data: {},
                timestamp: auditEvent.body.timestamp,
            },
            outcome: "Success",
        });
    });

    it("audits only authenticated requests when auditAuthOnly enabled", async () => {
        server.auth.scheme("custom", (server, options) => {
            const scheme = {
                authenticate: (request, h) => {
                    const credentials = {
                        userName: "user",
                    };
                    return h.authenticated({ credentials });
                },
            };

            return scheme;
        });
        server.auth.strategy("default", "custom", { name: "sid" });
        server.auth.default("default");

        await server.register({
            plugin,
            options: {
                // override default so that audit logs are not printed
                eventHandler: (data) => {},
                auditAuthOnly: true,
                usernameKey: "userName",
            },
        });

        server.events.on("hapi-audit-rest", ({ auditLog }) => {
            auditEvent = auditLog;
        });

        // no auth
        server.route({
            method: "GET",
            path: "/api/no-auth",
            handler: (request, h) => "OK",
            options: {
                auth: false,
            },
        });

        const res = await server.inject({
            method: "get",
            url: "/api/no-auth",
        });

        expect(res.statusCode).to.equal(200);
        expect(auditError).to.be.null();
        expect(auditEvent).to.be.null();

        // with auth
        server.route({
            method: "GET",
            path: "/api/with-auth",
            handler: (request, h) => "OK",
        });

        const authRes = await server.inject({
            method: "get",
            url: "/api/with-auth",
        });

        expect(authRes.statusCode).to.equal(200);
        expect(auditError).to.be.null();
        expect(auditEvent).to.equal({
            application: "my-app",
            type: "SEARCH",
            body: {
                entity: "with-auth",
                entityId: null,
                action: "SEARCH",
                username: "user",
                data: {},
                timestamp: auditEvent.body.timestamp,
            },
            outcome: "Success",
        });
    });

    it("propagates correctly the entity if a getEntity function is provided", async () => {
        await server.register({
            plugin,
            options: {
                // override default so that audit logs are not printed
                eventHandler: (data) => {},
                getEntity: (path) => "entity-from-provided-getEntity",
            },
        });

        server.events.on("hapi-audit-rest", ({ auditLog }) => {
            auditEvent = auditLog;
        });

        server.route({
            method: "GET",
            path: "/api/test",
            handler: (request, h) => "OK",
        });

        const res = await server.inject({
            method: "get",
            url: "/api/test",
        });

        expect(res.statusCode).to.equal(200);
        expect(auditError).to.be.null();
        expect(auditEvent).to.equal({
            application: "my-app",
            type: "SEARCH",
            body: {
                entity: "entity-from-provided-getEntity",
                entityId: null,
                action: "SEARCH",
                username: null,
                data: {},
                timestamp: auditEvent.body.timestamp,
            },
            outcome: "Success",
        });
    });

    it("does not initialize plugin when disabled", async () => {
        let error = null;

        await server.register({
            plugin,
            options: {
                isEnabled: false,
            },
        });

        try {
            server.events.on("hapi-audit-rest", ({ auditLog }) => {
                auditEvent = auditLog;
            });
        } catch (e) {
            error = e.message;
        }

        server.route({
            method: "GET",
            path: "/api/test",
            handler: (request, h) => "OK",
        });

        const res = await server.inject({
            method: "get",
            url: "/api/test",
        });

        expect(res.statusCode).to.equal(200);
        expect(error).to.be.equal("Unknown event hapi-audit-rest");
        expect(auditEvent).to.be.null();
    });
});
