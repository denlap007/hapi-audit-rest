# hapi-audit-rest

Small opinionated [Hapi.js] plugin that generates **audit logs** for **REST APIs**.

## Requirements

Works with Hapi **v17** or higher

## Installation

`npm i -S hapi-audit-rest`

## About

Creates audit log documents:

-   **Actions**: represent general purpose interactions i.e. search (GET).
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
// emitted data on GET /api/users request
{
    application: "my-app",
    type: "SEARCH",
    body: {
        entity: "users",
        entityId: null,
        action: "SEARCH",
        username: null, // or the username if authenticated
        timestamp: "2021-02-13T18:11:25.917Z",
        data: {},
    },
    outcome: "Success",
};

// emitted data on GET /api/users/1 request
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
    firstName: "first",
    lastName: "last",
};

// emitted data on POST /api/users request with payload user, created user with id returned in response
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
            firstName: "first",
            lastName: "last",
        },
        timestamp: "2021-02-20T20:53:04.821Z",
    },
    outcome: "Success",
};
```

### DELETE Requests

```js
// emitted data on DELETE /api/users/1 request
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
            firstName: "first",
            lastName: "last",
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
// emitted data on PUT /api/users/1 request
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
            firstName: "first",
            lastName: "last",
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

### Plugin options

| Name               | Type                      | Default                  | Allowed Values | Mandatory                        | Description                                                                                                                                                                                                                         |
| ------------------ | ------------------------- | ------------------------ | -------------- | -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| auditGetRequests   | `Boolean`                 | true                     | true\|false    | no                               | Enable/Disable auditing of GET requests.                                                                                                                                                                                            |
| showErrorsOnStdErr | `Boolean`                 | true                     | true\|false    | no                               | Display errors on std error stream.                                                                                                                                                                                                 |
| diffFunc           | `Function`                | _provided_               |                | no                               | External function to diff old and new values, Must return an array with two elements: old values and new values, with that order. **The default** implementation `returns` **fetched old and new values**.                          |
| disableCache       | `Boolean`                 | false                    | true\|false    | no                               | Enable/Disable internal cache. **Use cache** only if running an **one instance server**. If a GET by id is triggered before an update (PUT), old values will be loaded from cache instead of requiring an extra GET by id API call. |
| clientId           | `String`                  | "my-app"                 |                | no                               | Application instance name or auth client id.                                                                                                                                                                                        |
| auditAuthOnly      | ` Boolean`                | false                    | true\|false    | no                               | Enable/Disable auditing of **only authenticated requests**.                                                                                                                                                                         |
| usernameKey        | `String`                  |                          |                | _yes when auditAuthOnly enabled_ | The path/key to the username stored in _request.auth.credentials_ object.                                                                                                                                                           |
| cacheExpiresIn     | `Number Positive Integer` | 900000 (msecs - 15 mins) | >= 300000      | no                               | Time in msecs that cache expires (when _disableCache = false_).                                                                                                                                                                     |
| isAuditable        | `Function`                | _provided_               |                | no                               | Checks if current path is auditable. **The default** implementation checks if **path starts with /api**                                                                                                                             |
| eventHanler        | `Function`                | _provided_               |                | no                               | Handler for the emitted events, invoked with _named arguments_ **auditLog** and **routeEndpoint**. **The default** implementations prints the audit log to stdout.                                                                  |
| getEntity          | `Function`                | _provided_               |                | no                               | Creates the entity name of the audit log. **The default** implementation `returns` the string after /api/ and before next / if any.                                                                                                 |

### Route options

| Name           | Type       | Default | Allowed Values                         | Mandatory | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| -------------- | ---------- | ------- | -------------------------------------- | --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ext            | `Function` |         |                                        | no        | An extention point per route to **customize audit log document values**. Invoked with named arguments: <ul><li>on GET<ul><li>headers</li><li>query</li><li>params</li></ul></li><li>on POST<ul><li>headers</li><li>query</li><li>params</li><li>newVals</li></ul></li><li>on PUT</li><ul><li>headers</li><li>query</li><li>params</li><li>oldVals</li><li>newVals</li><li>diff: ({ diffOnly, skipDiff })</li></ul><li>on DELETE<ul><li>headers</li><li>query</li><li>params</li><li>oldVals</li></ul></li><li>on PUT/POST and _isAction=true_<ul><li>headers</li><li>query</li><li>params</li><li>payload</li></ul></li></ul>Must `return an object` with any of the following **values to override** per type: <ul><li>Audit Action<ul><li>type `String`</li><li>entity `String`</li><li>entityId `String`/`Number`/`Null`</li><li>action `String`</li><li>data `Object`/`Null`</li></ul></li><li>Audit Mutation<ul><li>type `String`</li><li>entity `String`</li><li>entityId `String`/`Number`/`Null`</li><li>action `String`</li><li>originalValues `Object`/`Null`</li><li>newValues `Object`/`Null`</li></ul></li></ul> |
| isAction       | `Boolean`  | false   | true\|false                            | no        | Enable/Disable creation of **action** audit log documents for **PUT/POST** requests instead of mutation.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| getPath        | `Function` |         |                                        | no        | On PUT requests, old and/or new values are fetched by injecting a **GET by id** request, based on PUT route path. When GET by id route path differs, it must be provided. Function is **invoked** with _named arguments_ **({ query, params })** and must `return a string` with the corresponding GET by id route path.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| auditAsUpdate  | `Boolean`  | false   | true _when isAction=false, else false_ | no        | Force PUT request flow (edge case).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| fetchNewValues | `Boolean`  | false   | true\|false                            | no        | On PUT requests, the **incoming payload** will be used as **newValues**. In case there are any model inconsistencies, this option will inject a **GET by id** request to **fetch the newValues**.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |

## License

hapi-audit-rest is licensed under a MIT License.

[hapi.js]: https://hapi.dev/
