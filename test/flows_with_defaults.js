const Hapi = require("@hapi/hapi");
const Lab = require("@hapi/lab");
const { expect } = require("@hapi/code");

const plugin = require("../lib/index");

const { describe, it, before, after, afterEach, beforeEach } = (exports.lab = Lab.script());

const internals = {};

internals.implmentation = (server, options) => {
    const scheme = {
        authenticate: (request, h) => {
            const credentials = {
                userName: "user",
            };
            return h.authenticated({ credentials });
        },
    };

    return scheme;
};

internals.authInitialization = (server) => {
    server.auth.scheme("custom", internals.implmentation);
    server.auth.strategy("default", "custom", { name: "sid" });
    server.auth.default("default");
};

describe("flows with default settings", () => {
    let server = null;
    let auditError = null;
    let auditEvent = null;

    beforeEach(async () => {
        server = Hapi.server();

        internals.authInitialization(server);

        await server.register([
            {
                plugin,
                options: {
                    sidUsernameAttribute: "userName",
                },
            },
        ]);

        server.events.on({ name: "request", channels: "app" }, (request, event, tags) => {
            if (tags.error && tags["hapi-audit-rest"]) {
                auditError = event;
            }
        });

        server.events.on("hapi-audit-rest", (data) => {
            auditEvent = data;
        });
    });

    afterEach(() => {
        auditError = null;
        auditEvent = null;
        server = null;
    });

    it("emits an action audit record", async () => {
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
                entity: "test",
                entityId: undefined,
                action: "SEARCH",
                username: "user",
                data: {},
                timestamp: auditEvent.body.timestamp,
            },
            outcome: "Success",
        });
    });
    it("emits an action audit record with query params as data", async () => {
        server.route({
            method: "GET",
            path: "/api/test",
            handler: (request, h) => "OK",
        });

        const res = await server.inject({
            method: "get",
            url: "/api/test?search=test&page=1&sort=asc",
        });

        expect(res.statusCode).to.equal(200);

        expect(auditError).to.be.null();

        expect(auditEvent).to.equal({
            application: "my-app",
            type: "SEARCH",
            body: {
                entity: "test",
                entityId: undefined,
                action: "SEARCH",
                username: "user",
                data: {
                    search: "test",
                    page: "1",
                    sort: "asc",
                },
                timestamp: auditEvent.body.timestamp,
            },
            outcome: "Success",
        });
    });

    it("emits an action audit record with specific entityId", async () => {
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
            application: "my-app",
            type: "SEARCH",
            body: {
                entity: "test",
                entityId: "5",
                action: "SEARCH",
                username: "user",
                data: {},
                timestamp: auditEvent.body.timestamp,
            },
            outcome: "Success",
        });
    });

    it("emits a mutation audit record (POST - CREATE)", async () => {
        const reqPayload = { a: "a", b: "b", c: "c" };
        const resPayload = { id: 1, a: "a", b: "b", c: "c" };

        server.route({
            method: "POST",
            path: "/api/test",
            handler: (request, h) => resPayload,
        });

        const res = await server.inject({
            method: "POST",
            payload: reqPayload,
            url: "/api/test",
        });

        expect(res.statusCode).to.equal(200);
        expect(res.result).to.equal(resPayload);

        expect(auditError).to.be.null();

        expect(auditEvent).to.equal({
            application: "my-app",
            type: "MUTATION",
            body: {
                entity: "test",
                entityId: 1,
                action: "CREATE",
                username: "user",
                originalValues: {},
                newValues: {
                    id: 1,
                    a: "a",
                    b: "b",
                    c: "c",
                },
                timestamp: auditEvent.body.timestamp,
            },
            outcome: "Success",
        });
    });

    it("emits a mutation audit record (PUT - UPDATE) with oldValues loaded from cache and new values loaded from payload", async () => {
        const reqPayload = { a: "a", b: "bb", c: "cc" };
        const oldValues = { id: 1, a: "a", b: "b", c: "c" };

        server.route({
            method: "GET",
            path: "/api/test/{id}",
            handler: (request, h) => oldValues,
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
                username: "user",
                originalValues: oldValues,
                newValues: reqPayload,
                timestamp: auditEvent.body.timestamp,
            },
            outcome: "Success",
        });
    });

    it("emits a mutation audit record (PUT - UPDATE) with oldValues loaded from GET by id endpoint and new values loaded from payload", async () => {
        const reqPayload = { a: "a", b: "bb", c: "cc" };
        const oldValues = { id: 1, a: "a", b: "b", c: "c" };
        const newValues = { id: 1, a: "a", b: "bb", c: "cc" };
        let getResponse = oldValues;

        server.route({
            method: "GET",
            path: "/api/test/{id}",
            handler: (request, h) => getResponse,
        });

        server.route({
            method: "PUT",
            path: "/api/test/{id}",
            handler: (request, h) => "OK",
        });

        server.ext("onPostHandler", async (request, h) => {
            getResponse = newValues;

            return h.continue;
        });

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
                username: "user",
                originalValues: oldValues,
                newValues: reqPayload,
                timestamp: auditEvent.body.timestamp,
            },
            outcome: "Success",
        });
    });

    it("emits a mutation audit record (DELETE)", async () => {
        const oldValues = { id: 1, a: "a", b: "b", c: "c" };

        server.route({
            method: "GET",
            path: "/api/test/{id}",
            handler: (request, h) => oldValues,
        });

        server.route({
            method: "DELETE",
            path: "/api/test/{id}",
            handler: (request, h) => "OK",
        });

        const res = await server.inject({
            method: "DELETE",
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
                action: "DELETE",
                username: "user",
                originalValues: oldValues,
                newValues: {},
                timestamp: auditEvent.body.timestamp,
            },
            outcome: "Success",
        });
    });
});
