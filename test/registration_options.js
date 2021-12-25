const Hapi = require("@hapi/hapi");
const Lab = require("@hapi/lab");
const { expect } = require("@hapi/code");

const plugin = require("../lib/index");

const { describe, it, before, after, afterEach, beforeEach } = (exports.lab = Lab.script());

const internals = {};

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

    afterEach(async () => {
        auditError = null;
        auditEvent = null;
        await server.stop();
    });

    it("does not use internal cache to fetch old values when disabled", async (flags) => {
        await server.register({
            plugin,
            options: {
                eventHandler: (data) => {},
                cacheEnabled: false,
                getEntity: (path) => path.split("/")[2],
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
                getEntity: (path) => path.split("/")[2],
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

    it("throws and logs error to stderr", async () => {
        let loggedErr = null;

        process.stderr.write_orig = process.stderr.write;
        process.stderr.write = (data) => {
            loggedErr = data;
            process.stderr.write_orig(data);
        };

        await server.register({
            plugin,
            options: {
                debug: true,
                eventHandler: (data) => {},
                getEntity: (path) => {
                    throw new Error("custom test error");
                },
            },
        });

        server.events.on("hapi-audit-rest", ({ auditLog }) => {
            auditEvent = auditLog;
        });

        server.route({
            method: "GET",
            path: "/test/{id}",
            handler: (request, h) => "OK",
        });

        const res = await server.inject({
            method: "get",
            url: "/test/5",
        });

        expect(res.statusCode).to.equal(200);
        expect(auditError.data).to.equal("custom test error");
        expect(auditEvent).to.be.null();
        expect(loggedErr).to.include("custom test error");
    });

    it("propagates the path as entity if getEntity function is not provided", async () => {
        await server.register({
            plugin,
            options: {
                eventHandler: (data) => {},
            },
        });

        server.events.on("hapi-audit-rest", ({ auditLog }) => {
            auditEvent = auditLog;
        });

        server.route({
            method: "GET",
            path: "/api/test/custom",
            handler: (request, h) => "OK",
        });

        const res = await server.inject({
            method: "get",
            url: "/api/test/custom",
        });

        expect(res.statusCode).to.equal(200);
        expect(auditError).to.be.null();
        expect(auditEvent).to.equal({
            application: "my-app",
            type: "SEARCH",
            body: {
                entity: "/api/test/custom",
                entityId: null,
                action: "SEARCH",
                username: null,
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
                getEntity: (path) => path.split("/")[2],
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

    it("checks cache eviction (waits 2 minutes)", { timeout: 130000 }, async (flags) => {
        await server.register({
            plugin,
            options: {
                // override default so that audit logs are not printed
                eventHandler: (data) => {},
                cacheExpiresIn: 60000,
                getEntity: (path) => path.split("/")[2],
            },
        });

        server.events.on("hapi-audit-rest", ({ auditLog }) => {
            auditEvent = auditLog;
        });

        const reqPayload = { a: "a", b: "bb", c: "cc" };
        const oldVals = { id: 1, a: "a", b: "b", c: "c" };

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

        // used to enable caching of oldValues
        await server.inject({
            method: "get",
            url: "/api/test/5",
        });

        // wait > 1 minute for cache to expire (minimum 1 minute)
        // cache eviction will occur in 1 minute, (as defined in test with cacheExpiresIn: 60000)
        // to avoid race conditions cache values stored for more than 1 minute (cache default build-in)
        // from the moment the eviction will occur, will be cleared
        await new Promise((resolve) => setTimeout(resolve, 120000));

        const res = await server.inject({
            method: "PUT",
            payload: reqPayload,
            url: "/api/test/5",
        });

        expect(res.statusCode).to.equal(200);

        expect(auditError).to.be.null();

        expect(auditEvent).to.equal({
            application: "my-app",
            type: "MUTATION",
            body: {
                entity: "test",
                entityId: "5",
                action: "UPDATE",
                username: null,
                originalValues: oldVals,
                newValues: reqPayload,
                timestamp: auditEvent.body.timestamp,
            },
            outcome: "Success",
        });
    });

    it("overrides completely all audit document values when extAll function is provided", async () => {
        await server.register({
            plugin,
            options: {
                eventHandler: ({ auditLog, endpoint }) => {},
                extAll: (request, auditLog) => {
                    expect(auditLog).to.equal({
                        application: "my-app",
                        type: "SEARCH",
                        body: {
                            entity: "test",
                            entityId: "5",
                            action: "SEARCH",
                            username: null,
                            data: {},
                            timestamp: auditLog.body.timestamp,
                        },
                        outcome: "Success",
                    });

                    return {
                        application: "custom-application",
                        type: "custom-type",
                        body: {
                            entity: "custom-entity",
                            entityId: "custom-entity-id",
                            action: "custom-action",
                            username: "custom-username",
                            data: "custom-data",
                            timestamp: "custom-timestamp",
                        },
                        outcome: "custom-outcome",
                    };
                },
                getEntity: (path) => path.split("/")[2],
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
            application: "custom-application",
            type: "custom-type",
            body: {
                entity: "custom-entity",
                entityId: "custom-entity-id",
                action: "custom-action",
                username: "custom-username",
                data: "custom-data",
                timestamp: "custom-timestamp",
            },
            outcome: "custom-outcome",
        });
    });

    it("does not audit request if isAuditable returns false", async () => {
        const routePath = "/api/test/custom";
        await server.register({
            plugin,
            options: {
                eventHandler: (data) => {},
                isAuditable: ({ path }) => path !== routePath,
            },
        });

        server.events.on("hapi-audit-rest", ({ auditLog }) => {
            auditEvent = auditLog;
        });

        server.route({
            method: "GET",
            path: routePath,
            handler: (request, h) => "OK",
        });

        const res = await server.inject({
            method: "get",
            url: routePath,
        });

        expect(res.statusCode).to.equal(200);
        expect(auditError).to.be.null();
        expect(auditEvent).to.be.null();
    });
});
