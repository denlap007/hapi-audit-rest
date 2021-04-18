const Hapi = require("@hapi/hapi");
const Lab = require("@hapi/lab");
const { expect } = require("@hapi/code");

const plugin = require("../lib/index");

const { describe, it, before, after, afterEach, beforeEach } = (exports.lab = Lab.script());

describe("Route settings", () => {
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

    it("overrides audit action document values when ext function is provided", async () => {
        await server.register({
            plugin,
            options: {
                eventHandler: ({ auditLog, endpoint }) => {},
            },
        });

        server.events.on("hapi-audit-rest", ({ auditLog }) => {
            auditEvent = auditLog;
        });

        server.route({
            method: "GET",
            path: "/api/test/{id}",
            handler: (request, h) => "OK",
            options: {
                plugins: {
                    "hapi-audit-rest": {
                        ext: ({ headers, query, params }) => ({
                            type: "CUSTOM",
                            entity: "custom",
                            entityId: "custom",
                            action: "CUSTOM",
                            data: {
                                custom: true,
                            },
                        }),
                    },
                },
            },
        });

        const res = await server.inject({
            method: "get",
            url: "/api/test/5",
        });

        expect(res.statusCode).to.equal(200);
        expect(auditError).to.be.null();
        expect(auditEvent).to.equal({
            application: "my-app",
            type: "CUSTOM",
            body: {
                entity: "custom",
                entityId: "custom",
                action: "CUSTOM",
                username: null,
                data: {
                    custom: true,
                },
                timestamp: auditEvent.body.timestamp,
            },
            outcome: "Success",
        });
    });

    it("overrides audit mutation document values when ext function is provided", async () => {
        await server.register({
            plugin,
            options: {
                eventHandler: ({ auditLog, endpoint }) => {},
            },
        });

        server.events.on("hapi-audit-rest", ({ auditLog }) => {
            auditEvent = auditLog;
        });

        const oldVals = { data: "old vals" };
        const newVals = { data: "new vals" };

        server.route({
            method: "GET",
            path: "/api/test/{id}",
            handler: (request, h) => oldVals,
        });

        server.route({
            method: "PUT",
            path: "/api/test/{id}",
            handler: (request, h) => "OK",
            options: {
                plugins: {
                    "hapi-audit-rest": {
                        ext: ({ headers, query, params }) => ({
                            entity: "custom",
                            entityId: "custom",
                            action: "CUSTOM",
                            originalValues: {
                                original: true,
                            },
                            newValues: {
                                new: true,
                            },
                        }),
                    },
                },
            },
        });

        const res = await server.inject({
            method: "put",
            url: "/api/test/5",
            payload: newVals,
        });

        expect(res.statusCode).to.equal(200);
        expect(auditError).to.be.null();
        expect(auditEvent).to.equal({
            application: "my-app",
            type: "MUTATION",
            body: {
                entity: "custom",
                entityId: "custom",
                action: "CUSTOM",
                username: null,
                originalValues: {
                    original: true,
                },
                newValues: {
                    new: true,
                },
                timestamp: auditEvent.body.timestamp,
            },
            outcome: "Success",
        });
    });

    it("emits an audit action when isAction set to true", async () => {
        await server.register({
            plugin,
            options: {
                eventHandler: ({ auditLog, endpoint }) => {},
            },
        });

        server.events.on("hapi-audit-rest", ({ auditLog }) => {
            auditEvent = auditLog;
        });

        const oldVals = { data: "old vals" };
        const newVals = { data: "new vals" };

        server.route({
            method: "GET",
            path: "/api/test/{id}",
            handler: (request, h) => oldVals,
        });

        server.route({
            method: "PUT",
            path: "/api/test/{id}",
            handler: (request, h) => "OK",
            options: {
                plugins: {
                    "hapi-audit-rest": {
                        isAction: true,
                    },
                },
            },
        });

        const res = await server.inject({
            method: "put",
            url: "/api/test/5",
            payload: newVals,
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
                username: null,
                data: newVals,
                timestamp: auditEvent.body.timestamp,
            },
            outcome: "Success",
        });
    });

    it("overrides the default endpoint to get values before update when getPath function is provided", async () => {
        await server.register({
            plugin,
            options: {
                eventHandler: ({ auditLog, endpoint }) => {},
            },
        });

        server.events.on("hapi-audit-rest", ({ auditLog }) => {
            auditEvent = auditLog;
        });

        const oldVals = { data: "old vals" };
        const newVals = { data: "new vals" };

        server.route({
            method: "GET",
            path: "/api/different/{id}",
            handler: (request, h) => oldVals,
        });

        server.route({
            method: "PUT",
            path: "/api/test/{id}",
            handler: (request, h) => "OK",
            options: {
                plugins: {
                    "hapi-audit-rest": {
                        getPath: ({ query, params }) => `/api/different/${params.id}`,
                    },
                },
            },
        });

        const res = await server.inject({
            method: "put",
            url: "/api/test/5",
            payload: newVals,
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
                newValues: newVals,
                timestamp: auditEvent.body.timestamp,
            },
            outcome: "Success",
        });
    });

    it("fetches new values when fetchNewValues set to true", async () => {
        await server.register({
            plugin,
            options: {
                eventHandler: ({ auditLog, endpoint }) => {},
            },
        });

        server.events.on("hapi-audit-rest", ({ auditLog }) => {
            auditEvent = auditLog;
        });

        const oldVals = { id: 1, data: "old vals" };
        const payload = { data: "new vals" };
        const newVals = { id: 1, data: "new vals" };
        let getResponse = oldVals;

        server.route({
            method: "GET",
            path: "/api/test/{id}",
            handler: (request, h) => getResponse,
        });

        server.route({
            method: "PUT",
            path: "/api/test/{id}",
            handler: (request, h) => "OK",
            options: {
                plugins: {
                    "hapi-audit-rest": {
                        fetchNewValues: true,
                    },
                },
            },
        });

        server.ext("onPostHandler", async (request, h) => {
            getResponse = newVals;

            return h.continue;
        });

        const res = await server.inject({
            method: "put",
            url: "/api/test/5",
            payload,
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
                newValues: newVals,
                timestamp: auditEvent.body.timestamp,
            },
            outcome: "Success",
        });
    });

    it("validates route options", async () => {
        await server.register({
            plugin,
        });

        server.events.on("hapi-audit-rest", ({ auditLog }) => {
            auditEvent = auditLog;
        });

        server.route({
            method: "GET",
            path: "/api/test",
            handler: (request, h) => "OK",
            options: {
                plugins: {
                    "hapi-audit-rest": {
                        ext: async () => {},
                        isAction: true,
                        getPath: () => {},
                        fetchNewValues: true,
                    },
                },
            },
        });

        await server.start();

        expect(auditError).to.be.null();
        expect(auditEvent).to.be.null();

        await server.stop();
    });

    it("does not emit an audit record when disabled on route", async () => {
        await server.register({
            plugin,
        });

        server.events.on("hapi-audit-rest", ({ auditLog }) => {
            auditEvent = auditLog;
        });

        server.route({
            method: "GET",
            path: "/api/test",
            handler: (request, h) => "OK",
            options: {
                plugins: {
                    "hapi-audit-rest": false,
                },
            },
        });

        const res = await server.inject({
            method: "get",
            url: "/api/test",
        });

        expect(res.statusCode).to.equal(200);
        expect(auditError).to.be.null();
        expect(auditEvent).to.be.null();
    });
});
