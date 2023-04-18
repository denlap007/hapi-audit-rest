# Changelog

## v4.1.0

Added isAuditale on routeOptions, invoked with request as parameter.

## v4.0.1

On pre-response of a POST request when response.source.data is empty string use the request payload for audit record data (204 response status code from third party HTTP library i.e. axios).

## Breaking changes v4

### Node.js

**Dropped** support for Node.js **12**. Minimum Node.js version is now **14**

### API changes

#### Registration Options

-   auditAuthOnly -> removed (can be filtered with isAuditable, check example below)
-   auditGetRequests -> removed (can be filtered with isAuditable, check example below)
-   showErrorsOnStdErr -> renamed to **debug** (false by default)
-   isAuditable -> invoked with **request** as parameter (arity 1) to handle all cases (audits all by default, check example below for filtering)
-   getEntity -> renamed to **setEntity**. Returns by default the endpoint path
-   cacheEnabled -> renamed to isCacheEnabled

Example using **isAuditable** (auditAuthOnly, auditGetRequests cases and path filtering)

```js
await server.register({
    plugin: require("hapi-audit-rest"),
    options: {
        isAuditable: ({ auth: { isAuthenticated }, method, url: { pathname } }) => {
            // do not audit unauthenticated requests
            if (!isAuthenticated) {
                return false;
            }

            // do not audit GET requests
            if (method === "get") {
                return false;
            }

            // do not audit requests when path does not start from /api
            if (!pathname.startsWith("/api")) {
                return false;
            }

            // return true to audit all other cases
            return true;
        },
    },
});
```

Example using **setEntity** option:

```js
await server.register({
    plugin: require("hapi-audit-rest"),
    options: {
        // use the standard pattern of an api i.e. /api/v1.0/users, to refine the entity name
        // will have 'entity: users' in audit log
        setEntity: (path) => path.split("/")[3],
        }
    },
});
```

#### Route Options

-   getPath -> renamed to **setInjectedPath**
