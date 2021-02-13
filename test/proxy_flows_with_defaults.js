const Hapi = require("@hapi/hapi");
const Lab = require("@hapi/lab");
const h2o2 = require("@hapi/h2o2");
const Wreck = require("@hapi/wreck");
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

describe("PROXY flows with default settings", () => {
    let server = null;
    let upstream = null;
    let auditError = null;
    let auditEvent = null;

    beforeEach(async () => {
        server = Hapi.server();
        upstream = Hapi.server();

        internals.authInitialization(server);

        await server.register([
            {
                plugin,
                options: {
                    usernameKey: "userName",
                },
            },
            h2o2,
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
        server = null;
    });

    it("emits an action audit record", async () => {
        upstream.route({
            method: "GET",
            path: "/api/test",
            handler: (request, h) => "OK",
        });
        await upstream.start();

        server.route({
            method: "GET",
            path: "/api/test",
            handler: (request, h) => h.proxy({ host: "localhost", port: upstream.info.port }),
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

        await upstream.stop();
    });
    it("emits an action audit record with query params as data", async () => {
        upstream.route({
            method: "GET",
            path: "/api/test",
            handler: (request, h) => "OK",
        });

        await upstream.start();

        server.route({
            method: "GET",
            path: "/api/test",
            handler: (request, h) => h.proxy({ host: "localhost", port: upstream.info.port }),
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

        await upstream.stop();
    });

    it("emits an action audit record with specific entityId", async () => {
        upstream.route({
            method: "GET",
            path: "/api/test/{id}",
            handler: (request, h) => "OK",
        });

        await upstream.start();

        server.route({
            method: "GET",
            path: "/api/test/{id}",
            handler: (request, h) => h.proxy({ host: "localhost", port: upstream.info.port }),
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

        await upstream.stop();
    });

    it("throws on POST when response is streamed and cannot be accessed", async () => {
        const reqPayload = { a: "a", b: "b", c: "c" };
        const resPayload = { id: 1, a: "a", b: "b", c: "c" };

        upstream.route({
            method: "POST",
            path: "/api/test",
            handler: (request, h) => resPayload,
        });

        await upstream.start();

        server.route({
            method: "POST",
            path: "/api/test",
            handler: (request, h) =>
                h.proxy({
                    host: "localhost",
                    port: upstream.info.port,
                }),
            options: { payload: { parse: false } },
        });

        const res = await server.inject({
            method: "POST",
            payload: reqPayload,
            url: "/api/test",
        });

        expect(res.statusCode).to.equal(200);

        expect(auditError.data).to.equal("Cannot raed streamed response on post:/api/test");

        expect(auditEvent).to.be.null();

        await upstream.stop();
    });

    it("emits a mutation audit record (POST - CREATE) when response can be parsed", async () => {
        const reqPayload = { a: "a", b: "b", c: "c" };
        const resPayload = { id: 1, a: "a", b: "b", c: "c" };

        upstream.route({
            method: "POST",
            path: "/api/test",
            handler: (request, h) => resPayload,
        });

        await upstream.start();

        const onProxyResponse = async (err, res, request, h, settings, ttl) => {
            if (err) {
                throw err;
            }

            const payload = await Wreck.read(res, { json: true });

            if (res.statusCode >= 400 && res.statusCode <= 600) {
                throw payload;
            }

            const response = h.response(payload);
            response.headers = res.headers;
            return response;
        };

        server.route({
            method: "POST",
            path: "/api/test",
            handler: {
                proxy: { host: "localhost", port: upstream.info.port, onResponse: onProxyResponse },
            },
            options: { payload: { parse: false } },
        });

        const res = await server.inject({
            method: "POST",
            payload: reqPayload,
            url: "/api/test",
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

        await upstream.stop();
    });

    it("emits a mutation audit record (PUT - UPDATE) with old values and new values fetched from GET by id handler", async () => {
        const reqPayload = { a: "a", b: "bb", c: "cc" };
        const oldValues = { id: 1, a: "a", b: "b", c: "c" };
        const newValues = { id: 1, a: "a", b: "bb", c: "cc" };
        let getResponse = oldValues;
        let injectedGETcount = 0;

        upstream.route({
            method: "PUT",
            path: "/api/test/{id}",
            handler: (request, h) => "OK",
        });

        await upstream.start();

        server.route({
            method: "GET",
            path: "/api/test/{id}",
            handler: (request, h) => getResponse,
        });

        server.route({
            method: "PUT",
            path: "/api/test/{id}",
            handler: {
                proxy: { host: "localhost", port: upstream.info.port },
            },
            options: { payload: { parse: false } },
        });

        server.ext("onPostHandler", async (request, h) => {
            // simulate update and change the response retrieved from GET
            getResponse = newValues;

            // when cache is disabled, two GET requests will be injected to fetch old and new values
            injectedGETcount = request.headers.injected ? injectedGETcount + 1 : injectedGETcount;

            return h.continue;
        });

        const res = await server.inject({
            method: "PUT",
            payload: reqPayload,
            url: "/api/test/5",
        });

        expect(res.statusCode).to.equal(200);

        expect(auditError).to.be.null();

        expect(injectedGETcount).to.equal(2);

        expect(auditEvent).to.equal({
            application: "my-app",
            type: "MUTATION",
            body: {
                entity: "test",
                entityId: "5",
                action: "UPDATE",
                username: "user",
                originalValues: oldValues,
                newValues,
                timestamp: auditEvent.body.timestamp,
            },
            outcome: "Success",
        });

        await upstream.stop();
    });

    it("emits a mutation audit record (PUT - UPDATE) with old values fetched from cache and new values fetched from GET by id handler", async () => {
        const reqPayload = { a: "a", b: "bb", c: "cc" };
        const oldValues = { id: 1, a: "a", b: "b", c: "c" };
        const newValues = { id: 1, a: "a", b: "bb", c: "cc" };
        let getResponse = oldValues;
        let injectedGETcount = 0;

        upstream.route({
            method: "PUT",
            path: "/api/test/{id}",
            handler: (request, h) => "OK",
        });

        await upstream.start();

        server.route({
            method: "GET",
            path: "/api/test/{id}",
            handler: (request, h) => getResponse,
        });

        server.route({
            method: "PUT",
            path: "/api/test/{id}",
            handler: {
                proxy: { host: "localhost", port: upstream.info.port },
            },
            options: { payload: { parse: false } },
        });

        server.ext("onPostHandler", async (request, h) => {
            // simulate update and change the response retrieved from GET
            getResponse = newValues;
            // when cache is enabled, only one GET request will be injected to fetch new values
            injectedGETcount = request.headers.injected ? injectedGETcount + 1 : injectedGETcount;

            return h.continue;
        });

        server.ext("onPreHandler", async (request, h) => h.continue);

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

        expect(injectedGETcount).to.equal(1);

        expect(auditEvent).to.equal({
            application: "my-app",
            type: "MUTATION",
            body: {
                entity: "test",
                entityId: "5",
                action: "UPDATE",
                username: "user",
                originalValues: oldValues,
                newValues,
                timestamp: auditEvent.body.timestamp,
            },
            outcome: "Success",
        });

        await upstream.stop();
    });

    it("emits a mutation audit record (DELETE)", async () => {
        const oldValues = { id: 1, a: "a", b: "b", c: "c" };

        upstream.route({
            method: "DELETE",
            path: "/api/test/{id}",
            handler: (request, h) => "OK",
        });

        await upstream.start();

        server.route({
            method: "GET",
            path: "/api/test/{id}",
            handler: (request, h) => oldValues,
        });

        server.route({
            method: "DELETE",
            path: "/api/test/{id}",
            handler: (request, h) => h.proxy({ host: "localhost", port: upstream.info.port }),
            options: { payload: { parse: false } },
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

        await upstream.stop();
    });
});
