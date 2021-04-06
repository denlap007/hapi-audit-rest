# hapi-audit-rest

[![npm version](https://badge.fury.io/js/hapi-audit-rest.svg)](https://badge.fury.io/js/hapi-audit-rest)
[![Build Status](https://travis-ci.com/denlap007/hapi-audit-rest.png?branch=master)](https://travis-ci.com/denlap007/hapi-audit-rest)
[![Known Vulnerabilities](https://snyk.io/test/npm/hapi-audit-rest/badge.svg)](https://snyk.io/test/npm/hapi-audit-rest)

Small opinionated [Hapi.js] plugin that generates **audit logs** for **RESTful APIs**.

## Contents
  - [Requirements](#requirements)
  - [Installation](#installation)
  - [Testing](#testing)
  - [About](#about)
  - [Quickstart](#quickstart)
  - [Example Audit Log Documents](#example-audit-log-documents)
    - [GET Requests](#get-requests)
    - [POST Requests](#post-requests)
    - [DELETE Requests](#delete-requests)
    - [PUT Requests](#put-requests)
  - [API](#api)
    - [Plugin registration options](#plugin-registration-options)
    - [Plugin route options](#plugin-route-options)
      - [Disable plugin on route](#disable-plugin-on-route)
  - [Flows & Audit Log Data](#flows--audit-log-data)
      - [GET - scope _collection_](#get---scope-collection)
      - [GET - scope _resource_](#get---scope-resource)
      - [POST - scope collection](#post---scope-collection)
        - [mutation (default)](#mutation-default)
        - [action](#action)
      - [PUT - scope resource](#put---scope-resource)
        - [mutation (default)](#mutation-default-1)
        - [action](#action-1)
      - [DELETE - scope resource](#delete---scope-resource)
  - [Error handling](#error-handling)
  - [License](#license)

## Requirements

Works with Hapi **v18** or higher, Node.js **v12** or higher

## Installation

```js
npm i -S hapi-audit-rest
```

## Testing

```js
npm test
```

## About

This plugin creates audit log documents:

-   **Actions**: general interactions (GET).
-   **Mutations**: track **old and new state** of a resource (POST, PUT, DELETE), to effectively **reason about state changes**.

For every request an **event** is emitted with an **audit log** (action or mutation) document.

## Quickstart

```js
await server.register({
    plugin: require("hapi-audit-rest"),
});
```

## Example Audit Log Documents

Consider a CRUD API on users.

### GET Requests

```js
// emitted data on GET /api/users?page=1&limit=10&sort=asc&column=id
{
    application: "my-app",
    type: "SEARCH",
    body: {
        entity: "users",
        entityId: null,
        action: "SEARCH",
        username: null, // or the username if authenticated
        timestamp: "2021-02-13T18:11:25.917Z",
        data: {
            page: 1,
            limit: 10,
            sort: 'asc',
            column: 'id'
        },
    },
    outcome: "Success",
};

// emitted data on GET /api/users/1
{
    application: "my-app",
    type: "SEARCH",
    body: {
        entity: "users",
        entityId: "1",
        action: "SEARCH",
        username: null, // or the username if authenticated
        timestamp: "2021-02-13T18:11:25.917Z",
        data: {},
    },
    outcome: "Success",
};
```

### POST Requests

```js
// consider the payload
const user = {
    username: "user",
    firstName: "first name",
    lastName: "last name",
};

// emitted data on POST /api/users, with payload user, created user with id returned in response
{
    application: "my-app",
    type: "MUTATION",
    body: {
        entity: "users",
        entityId: 1,
        action: "CREATE",
        username: null, // or the username if authenticated
        originalValues: null,
        newValues: {
            id: 1,
            username: "user",
            firstName: "first name",
            lastName: "last name",
        },
        timestamp: "2021-02-20T20:53:04.821Z",
    },
    outcome: "Success",
};
```

### DELETE Requests

```js
// emitted data on DELETE /api/users/1
{
    application: "my-app",
    type: "MUTATION",
    body: {
        entity: "users",
        entityId: 1,
        action: "DELETE",
        username: null, // or the username if authenticated
        originalValues: {
            id: 1,
            username: "user",
            firstName: "first name",
            lastName: "last name",
        },
        newValues: null,
        timestamp: "2021-02-20T20:53:04.821Z",
    },
    outcome: "Success",
};
```

### PUT Requests

```js
// consider the payload
const user = {
    firstName: "updated first",
};
// emitted data on PUT /api/users/1
{
    application: "my-app",
    type: "MUTATION",
    body: {
        entity: "users",
        entityId: 1,
        action: "UPDATE",
        username: null, // or the username if authenticated
        originalValues: {
            id: 1,
            username: "user",
            firstName: "first name",
            lastName: "last name",
        },
        newValues: {
            firstName: "updated first", // use option fetchNewValues for the whole updated entity object
        },
        timestamp: "2021-02-20T20:53:04.821Z",
    },
    outcome: "Success",
};
```

## API

### Plugin registration options

```js
await server.register({
    plugin: require("hapi-audit-rest"),
    options: {
        // plugin registration options
    },
});
```

| Name               | Type                      | Default         | Mandatory                                                                          | Description                                                                                                                                                                                                                                                                                            |
| ------------------ | ------------------------- | --------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| auditGetRequests   | `Boolean`                 | true            | no                                                                                 | Enable/Disable auditing of GET requests.                                                                                                                                                                                                                                                               |
| showErrorsOnStdErr | `Boolean`                 | true            | no                                                                                 | Display errors on std error stream.                                                                                                                                                                                                                                                                    |
| diffFunc           | `Function`                | _provided_      | no                                                                                 | External function to diff old and new values, Must `return` an array with two elements: old values and new values, with that order. **The default** implementation `returns` **fetched old and new values**. <br><br>_Signature<br> `function (oldValues, newValues) {return [oldValues, newValues]}`_ |
| cacheEnabled       | `Boolean`                 | true            | no                                                                                 | Enable/Disable internal cache. **Use cache** only if running an **one instance server (default enabled)**. If a GET by id is triggered before an update (PUT), old values will be loaded from cache instead of requiring an extra GET by id API call.                                                  |
| clientId           | `String`                  | my-app          | no                                                                                 | Application instance name or auth client id.                                                                                                                                                                                                                                                           |
| auditAuthOnly      | ` Boolean`                | false           | no                                                                                 | Enable/Disable auditing of **only authenticated requests**.                                                                                                                                                                                                                                            |
| usernameKey        | `String`                  |                 | yes <span style="font-size:0.8em;">(when auditAuthOnly enabled)</span> <br>else no | The path/key to the username stored in _request.auth.credentials_ object.                                                                                                                                                                                                                              |
| cacheExpiresIn     | `Number Positive Integer` | 900000 (15mins) | no                                                                                 | Time (_msecs_) until cache expires (when _cacheEnabled = false_). Minimum 60000 (1 minute).                                                                                                                                                                                                            |
| isAuditable        | `Function`                | _provided_      | no                                                                                 | Checks if current path is auditable. **The default** implementation checks if **path starts with /api**.<br><br>_Signature<br> `function (path, method) {return Boolean}`_                                                                                                                             |
| `eventHandler`     | `Function`                | _provided_      | no                                                                                 | Handler for the emitted events. **The default** implementations prints the audit log to stdout. You will have to implement this function in order to do something with the audit log.<br><br>_Signature<br> `function ({ auditLog, routeEndpoint })`_                                                  |
| getEntity          | `Function`                | _provided_      | no                                                                                 | Creates the entity name of the audit log. **The default** implementation `returns` the string after /api/ and before next / if any.<br><br>_Signature<br> `function (path) {return String}`_                                                                                                           |

### Plugin route options

```js
// at any route
options: {
   plugins: {
      "hapi-audit-rest": {
        // plugin route options
      }
   }
}
```

| Name           | Type       | Default | Mandatory | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| -------------- | ---------- | ------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| ext            | `Function` |         | no        | <a name="ext"></a>An extension point per route, invoked on `pre-response`, to **customize audit log document values**: <ul><li>on GET<br>`async (request) => AuditAction`</li><li>on POST<br>`async (request, { newVals }) => AuditMutation`</li><li>on PUT<br>`async (request, { oldVals, newVals, diff }) => AuditMutation`<br><br>diff: `({diffOnly, skipDiff}) => [originalValues, newValues]` </li><li>on DELETE<br>`async (request, { oldVals }) => AuditMutation`</li><li>on PUT/POST and _isAction=true_ <br>`async (request) => AuditAction`</li></ul>Must `return an object (AuditAction or AuditMutation)` with any of the following **properties to override the default values**: <ul><li>Audit Action<ul><li>type `String`</li><li>entity `String`</li><li>entityId `String`/`Number`/`Null`</li><li>action `String`</li><li>data `Object`/`Null`</li></ul></li><li>Audit Mutation<ul><li>entity `String`</li><li>entityId `String`/`Number`/`Null`</li><li>action `String`</li><li>originalValues `Object`/`Array`/`Null`</li><li>newValues `Object`/`Array`/`Null`</li></ul></li></ul> |
| isAction       | `Boolean`  | false   | no        | <a name="is-action"></a>Enable/Disable creation of **action** audit log documents for **PUT/POST** requests instead of mutation.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| getPath        | `Function` |         | no        | <a name="get-path"></a>On PUT requests, old and/or new values are fetched by injecting a **GET by id** request, based on PUT route path. When GET by id route path differs, it must be provided. <br><br>_Signature<br> `function (request) {return String}`_                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| fetchNewValues | `Boolean`  | false   | no        | <a name="fetch-new"></a>On PUT requests, the **incoming payload** will be used as **newValues**. In case there are any model inconsistencies, this option will inject a **GET by id** request to **fetch the newValues**.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |

#### Disable plugin on route

By default the plugin applies to **all registered routes**. Should you need to exclude any, apply to the route:

```js
options: {
   plugins: {
      "hapi-audit-rest": false,
   },
}
```

## Flows & Audit Log Data

To effectively track old and new state of a resource, the plugin implements internal flows based on the following **semantics**:

| HTTP method | Scope      | Description                            |
| ----------- | ---------- | -------------------------------------- |
| GET         | collection | Retrieve all resources in a collection |
| GET         | resource   | Retrieve a single resource             |
| POST        | collection | Create a new resource in a collection  |
| PUT         | resource   | Update a resource                      |
| DELETE      | resource   | Delete a resource                      |

The user can **override** audit log document defaults by using the route [extension point](#ext).

#### GET - scope _collection_

An _action_ audit log document is created, on pre-response lifecycle if the request succeeds with the following defaults:

```js
{
    application: "my-app",		// or the clientId if specified
    type: "SEARCH",
    body: {
        entity: $,				// as specified by getEntity function
        entityId: null,
        action: "SEARCH",
        username: null,			// or the username if authenticated
        timestamp: Date.now(),
        data: request.query,
    },
    outcome: "Success",
};
```

#### GET - scope _resource_

An _action_ audit log document is created, on pre-response lifecycle if the request succeeds with the following defaults:

```js
{
    application: "my-app",		// or the clientId if specified
    type: "SEARCH",
    body: {
        entity: $,				// as specified by getEntity function
        entityId: request.params.id,
        action: "SEARCH",
        username: null,			// or the username if authenticated
        timestamp: Date.now(),
        data: request.query,
    },
    outcome: "Success",
};
```

The response is _cached_ if cashing enabled.

#### POST - scope collection

##### mutation (default)

A _mutation_ audit log document is created on pre-response lifecycle if the request succeeds with the following defaults:

```js
{
    application: "my-app",		// or the clientId if specified
    type: "MUTATION",
    body: {
        entity: $,				// as specified by getEntity function
        entityId: request.response.source.id || request.payload.id,
        action: "CREATE",
        username: null,			// or the username if authenticated
        originalValues: null,
        newValues: request.response.source || request.payload,	// the response or the payload if response null
        timestamp: Date.now()",
    },
    outcome: "Success",
};
```

-   POST mutations rely to **request payload** or **response payload** to track the new resource state. If request is streamed to an upstream server this will result to an error.

##### action

In cases that it is not meaningful to audit a mutation, an _action_ audit log document can be created by setting [isAction](#is-action) route parameter.

```js
{
    application: "my-app",		// or the clientId if specified
    type: "SEARCH",
    body: {
        entity: $,				// as specified by getEntity function
        entityId: request.params.id || request.payload.id,
        action: "SEARCH",
        username: null,			// or the username if authenticated
        timestamp: Date.now(),
        data: request.payload,	// or null if request streamed
    },
    outcome: "Success",
};
```

#### PUT - scope resource

##### mutation (default)

A _mutation_ audit log document is created on pre-response lifecycle if the request succeeds with the following defaults:

```js
{
    application: "my-app",		// or the clientId if specified
    type: "MUTATION",
    body: {
        entity: $,				// as specified by getEntity function
        entityId: request.params.id || newValues.id,	// where newValues is either the request payload (default) or the resource data fetched after update when fetchNewValues=true or request streamed
        action: "UPDATE",
        username: null,			// or the username if authenticated
        originalValues: $,		// values fetched with injected GET by id call (or loaded from cache)
        newValues: request.payload || newValues,	// newValues = values fetched by injected GET by id call when fetchNewValues=true or request streamed
        timestamp: Date.now()",
    },
    outcome: "Success",
};
```

PUT mutations are the most complex.

-   Before the update, the original resource state is retrieved by inspecting the cache. If not in cache a GET by id request is injected based on the current request path (custom path can be set on route with [getPath](#get-path)).
-   After the update, the new resource state is retrieved from the request payload. If the request is streamed or the [fetchNewValues](#fetch-new) option is set, a GET by id request will be injected to fetch the new resource state.

##### action

In cases that it is not meaningful to audit a mutation, an _action_ audit log document can be created by setting [isAction](#is-action) route parameter.

```js
{
    application: "my-app",		// or the clientId if specified
    type: "SEARCH",
    body: {
        entity: $,				// as specified by getEntity function
        entityId: request.params.id || request.payload.id,
        action: "SEARCH",
        username: null,			// or the username if authenticated
        timestamp: Date.now(),
        data: request.payload,	// or null if request streamed
    },
    outcome: "Success",
};
```

#### DELETE - scope resource

A _mutation_ audit log document is created on pre-response lifecycle if the request succeeds with the following defaults:

```js
{
    application: "my-app",		// or the clientId if specified
    type: "MUTATION",
    body: {
        entity: $,				// as specified by getEntity function
        entityId: request.params.id || originalValues.id,	// where originalValues = resource state before delete
        action: "DELETE",
        username: null,			// or the username if authenticated
        originalValues: $,		// values fetched with injected GET by id request before delete
        newValues: null,
        timestamp: Date.now()",
    },
    outcome: "Success",
};
```

DELETE mutations retrieve old resource state by injecting a GET by id request before the delete operation.

## Error handling

When an error occurs, it is logged using the `request.log(tags, [data])` method:

-   tags: "error", "hapi-audit-rest"
-   data: error.message

The server isntance can interact with log information:

```js
server.events.on({ name: "request", channels: "app" }, (request, event, tags) => {
    if (tags.error && tags["hapi-audit-rest"]) {
        console.log(event); // do something with error data
    }
});
```

If `showErrorsOnStdErr` option is enabled (default), the error message will be printed to stderr for convenience.

## License

hapi-audit-rest is licensed under a MIT License.

[hapi.js]: https://hapi.dev/
