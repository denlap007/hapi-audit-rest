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

internals.constants = {
    GET_ALL: "GET all",
    GET_BY_ID: "GET by id",
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
    });

    it("GET all, should emit an audit action event", async () => {
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

        expect(auditError).to.equal(null);

        expect(auditEvent).to.part.include({
            application: "my-app",
            type: "SEARCH",
            body: {
                entity: "test",
                entityId: undefined,
                action: "SEARCH",
                username: "user",
                data: {},
            },
            outcome: "Success",
        });
    });

    it("GET by id, should emit an audit action event", async () => {
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

        expect(auditError).to.equal(null);

        expect(auditEvent).to.part.include({
            application: "my-app",
            type: "SEARCH",
            body: {
                entity: "test",
                entityId: "5",
                action: "SEARCH",
                username: "user",
                data: {},
            },
            outcome: "Success",
        });
    });

    it("POST, should emit an audit mutation event", async () => {
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

        expect(auditError).to.equal(null);

        expect(auditEvent).to.part.include({
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
            },
            outcome: "Success",
        });
    });

    it("PUT, should emit an audit mutation event with payload as new values", async () => {
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

        expect(auditError).to.equal(null);

        expect(auditEvent).to.part.include({
            application: "my-app",
            type: "MUTATION",
            body: {
                entity: "test",
                entityId: "5",
                action: "UPDATE",
                username: "user",
                originalValues: oldValues,
                newValues: reqPayload,
            },
            outcome: "Success",
        });
    });

    it("DELETE, should emit an audit mutation event", async () => {
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

        expect(auditError).to.equal(null);

        expect(auditEvent).to.part.include({
            application: "my-app",
            type: "MUTATION",
            body: {
                entity: "test",
                entityId: "5",
                action: "DELETE",
                username: "user",
                originalValues: oldValues,
                newValues: {},
            },
            outcome: "Success",
        });
    });
});
