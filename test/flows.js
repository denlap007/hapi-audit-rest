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
                    usernameKey: "userName",
                    eventHandler: ({ auditLog, endpoint }) => {},
                    debug: false,
                    getEntity: (path) => path.split("/")[2],
                },
            },
        ]);

        server.events.on({ name: "request", channels: "app" }, (request, event, tags) => {
            if (tags.error && tags["hapi-audit-rest"]) {
                auditError = event;
            }
        });

        server.events.on("hapi-audit-rest", ({ auditLog }) => {
            auditEvent = auditLog;
        });
    });

    afterEach(async () => {
        auditError = null;
        auditEvent = null;
        await server.stop();
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
                entityId: null,
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
                entityId: null,
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
                originalValues: null,
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
                newValues: null,
                timestamp: auditEvent.body.timestamp,
            },
            outcome: "Success",
        });
    });

    it("throws when old values cannot be retrieved on PUT and emits and audit log with new values only", async () => {
        server.route({
            method: "PUT",
            path: "/api/test/{id}",
            handler: (request, h) => "OK",
        });

        const res = await server.inject({
            method: "put",
            url: "/api/test/5",
            payload: { data: "new vals" },
        });

        expect(res.statusCode).to.equal(200);
        expect(auditError.data).to.equal(
            'Could not fetch values for injected request get:/api/test/5 before put:/api/test/5: {"statusCode":404,"error":"Not Found","message":"Not Found"}'
        );
        expect(auditEvent).to.equal({
            application: "my-app",
            type: "MUTATION",
            body: {
                entity: "test",
                entityId: "5",
                action: "UPDATE",
                username: "user",
                originalValues: null,
                newValues: {
                    data: "new vals",
                },
                timestamp: auditEvent.body.timestamp,
            },
            outcome: "Success",
        });
    });

    it("throws when old values cannot be retrieved on DELETE and emits and audit log without original values", async () => {
        server.route({
            method: "delete",
            path: "/api/test/{id}",
            handler: (request, h) => "OK",
        });

        const res = await server.inject({
            method: "delete",
            url: "/api/test/5",
        });

        expect(res.statusCode).to.equal(200);
        expect(auditError.data).to.equal(
            'Could not fetch values for injected request get:/api/test/5 before delete:/api/test/5: {"statusCode":404,"error":"Not Found","message":"Not Found"}'
        );
        expect(auditEvent).to.equal({
            application: "my-app",
            type: "MUTATION",
            body: {
                entity: "test",
                entityId: "5",
                action: "DELETE",
                username: "user",
                originalValues: null,
                newValues: null,
                timestamp: auditEvent.body.timestamp,
            },
            outcome: "Success",
        });
    });

    it("throws on unsupported flows", async () => {
        server.route({
            method: "patch",
            path: "/api/test/5",
            handler: (request, h) => "OK",
        });

        const res = await server.inject({
            method: "patch",
            url: "/api/test/5",
            payload: { data: "test" },
        });

        expect(res.statusCode).to.equal(200);

        expect(auditError.data).to.equal("Null auditLog record for endpoint: patch:/api/test/5");

        expect(auditEvent).to.be.null();
    });

    it("emits a mutation audit record (PUT - UPDATE) using route extention point to diff values using diffOnly", async () => {
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
            options: {
                plugins: {
                    "hapi-audit-rest": {
                        ext: async (req, { oldVals, newVals, diff }) => {
                            const diffOnly = ["b"];
                            const [originalValues, newValues] = diff({ diffOnly });

                            return {
                                originalValues,
                                newValues,
                            };
                        },
                    },
                },
            },
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
                originalValues: { b: "b" },
                newValues: { b: "bb" },
                timestamp: auditEvent.body.timestamp,
            },
            outcome: "Success",
        });
    });

    it("emits a mutation audit record (PUT - UPDATE) using route extention point to diff values with skipDiff", async () => {
        const reqPayload = { a: "aa", b: "bb", c: "cc" };
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
            options: {
                plugins: {
                    "hapi-audit-rest": {
                        ext: async (req, { oldVals, newVals, diff }) => {
                            const skipDiff = ["id", "a"];
                            const [originalValues, newValues] = diff({ skipDiff });

                            return {
                                originalValues,
                                newValues,
                            };
                        },
                    },
                },
            },
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
                originalValues: { b: "b", c: "c" },
                newValues: { b: "bb", c: "cc" },
                timestamp: auditEvent.body.timestamp,
            },
            outcome: "Success",
        });
    });

    it("emits an action audit record with default values when ext returns null on route", async () => {
        server.route({
            method: "GET",
            path: "/api/test",
            handler: () => "OK",
            options: {
                plugins: {
                    "hapi-audit-rest": {
                        ext: async () => null,
                    },
                },
            },
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
                entityId: null,
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

    it("emits a mutation audit record (DELETE) with overriden values returned from ext defined on route", async () => {
        const oldValues = { id: 1, a: "a", b: "b", c: "c" };
        const customAuditData = {
            entity: "custom",
            entityId: "custom-id",
            originalValues: { custom: true },
            newValues: { custom: false },
        };

        server.route({
            method: "GET",
            path: "/api/test/{id}",
            handler: () => oldValues,
        });

        server.route({
            method: "DELETE",
            path: "/api/test/{id}",
            handler: () => "OK",
            options: {
                plugins: {
                    "hapi-audit-rest": {
                        ext: async () => customAuditData,
                    },
                },
            },
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
                action: "DELETE",
                username: "user",
                timestamp: auditEvent.body.timestamp,
                ...customAuditData,
            },
            outcome: "Success",
        });
    });

    it("emits a mutation audit record (DELETE) with default values when ext is null on route", async () => {
        const oldValues = { id: 1, a: "a", b: "b", c: "c" };

        server.route({
            method: "GET",
            path: "/api/test/{id}",
            handler: () => oldValues,
        });

        server.route({
            method: "DELETE",
            path: "/api/test/{id}",
            handler: () => "OK",
            options: {
                plugins: {
                    "hapi-audit-rest": {
                        ext: null,
                    },
                },
            },
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
                newValues: null,
                timestamp: auditEvent.body.timestamp,
            },
            outcome: "Success",
        });
    });

    it("emits an action audit record with default values when ext is null on route", async () => {
        server.route({
            method: "GET",
            path: "/api/test",
            handler: () => "OK",
            options: {
                plugins: {
                    "hapi-audit-rest": {
                        ext: null,
                    },
                },
            },
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
                entityId: null,
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

    it("emits a mutation audit record (POST) with overriden values returned from ext defined on route", async () => {
        const oldValues = { id: 1, a: "a", b: "b", c: "c" };
        const customAuditData = {
            entity: "custom",
            entityId: "custom-id",
            originalValues: { custom: true },
            newValues: { custom: false },
        };

        server.route({
            method: "POST",
            path: "/api/test",
            handler: () => "OK",
            options: {
                plugins: {
                    "hapi-audit-rest": {
                        ext: async () => customAuditData,
                    },
                },
            },
        });

        const res = await server.inject({
            method: "POST",
            url: "/api/test",
            payload: oldValues,
        });

        expect(res.statusCode).to.equal(200);

        expect(auditError).to.be.null();

        expect(auditEvent).to.equal({
            application: "my-app",
            type: "MUTATION",
            body: {
                action: "CREATE",
                username: "user",
                timestamp: auditEvent.body.timestamp,
                ...customAuditData,
            },
            outcome: "Success",
        });
    });

    it("emits a mutation audit record (POST) with the request payload as data when response is null", async () => {
        const payload = { id: 1, a: "a", b: "b", c: "c" };

        server.route({
            method: "POST",
            path: "/api/test",
            handler: (request, h) => h.response().code(204),
        });

        const res = await server.inject({
            method: "POST",
            url: "/api/test",
            payload,
        });

        expect(res.statusCode).to.equal(204);

        expect(auditError).to.be.null();

        expect(auditEvent).to.equal({
            application: "my-app",
            type: "MUTATION",
            body: {
                entity: "test",
                entityId: 1,
                action: "CREATE",
                username: "user",
                originalValues: null,
                newValues: payload,
                timestamp: auditEvent.body.timestamp,
            },
            outcome: "Success",
        });
    });

    it("emits a mutation audit record (POST) with default values when ext returns null on route", async () => {
        const payload = { a: "a", b: "b", c: "c" };
        const response = { id: 1, a: "a", b: "b", c: "c" };

        server.route({
            method: "post",
            path: "/api/test",
            handler: () => response,
            options: {
                plugins: {
                    "hapi-audit-rest": {
                        ext: null,
                    },
                },
            },
        });

        const res = await server.inject({
            method: "post",
            url: "/api/test",
            payload,
        });

        expect(res.statusCode).to.equal(200);

        expect(auditError).to.be.null();

        expect(auditEvent).to.equal({
            application: "my-app",
            type: "MUTATION",
            body: {
                entity: "test",
                entityId: 1,
                action: "CREATE",
                username: "user",
                originalValues: null,
                newValues: response,
                timestamp: auditEvent.body.timestamp,
            },
            outcome: "Success",
        });
    });
});
