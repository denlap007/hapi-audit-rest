# hapi-audit-rest

Small opinionated [Hapi.js] plugin that generates **audit logs** for **REST APIs**.

## Requirements

Works with Hapi **v17** or higher

## Install

`npm i -S hapi-audit-rest`

## About

Creates audit log documents:

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

| Name               | Type                      | Default           | Mandatory                                                                          | Description                                                                                                                                                                                                                                                                                            |
| ------------------ | ------------------------- | ----------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| auditGetRequests   | `Boolean`                 | true              | no                                                                                 | Enable/Disable auditing of GET requests.                                                                                                                                                                                                                                                               |
| showErrorsOnStdErr | `Boolean`                 | true              | no                                                                                 | Display errors on std error stream.                                                                                                                                                                                                                                                                    |
| diffFunc           | `Function`                | _provided_        | no                                                                                 | External function to diff old and new values, Must `return` an array with two elements: old values and new values, with that order. **The default** implementation `returns` **fetched old and new values**. <br><br>_Signature<br> `function (oldValues, newValues) {return [oldValues, newValues]}`_ |
| cacheEnabled       | `Boolean`                 | true              | no                                                                                 | Enable/Disable internal cache. **Use cache** only if running an **one instance server (default enabled)**. If a GET by id is triggered before an update (PUT), old values will be loaded from cache instead of requiring an extra GET by id API call.                                                  |
| clientId           | `String`                  | my-app            | no                                                                                 | Application instance name or auth client id.                                                                                                                                                                                                                                                           |
| auditAuthOnly      | ` Boolean`                | false             | no                                                                                 | Enable/Disable auditing of **only authenticated requests**.                                                                                                                                                                                                                                            |
| usernameKey        | `String`                  |                   | yes <span style="font-size:0.8em;">(when auditAuthOnly enabled)</span> <br>else no | The path/key to the username stored in _request.auth.credentials_ object.                                                                                                                                                                                                                              |
| cacheExpiresIn     | `Number Positive Integer` | 900000 - (15mins) | no                                                                                 | Time (_msecs_) that cache expires (when _cacheEnabled = false_) - _min: 300000 (5 mins)_.                                                                                                                                                                                                              |
| isAuditable        | `Function`                | _provided_        | no                                                                                 | Checks if current path is auditable. **The default** implementation checks if **path starts with /api**.<br><br>_Signature<br> `function (path, method) {return Boolean}`_                                                                                                                             |
| `eventHandler`     | `Function`                | _provided_        | no                                                                                 | Handler for the emitted events. **The default** implementations prints the audit log to stdout. You will have to implement this function in order to do something with the audit log.<br><br>_Signature<br> `function ({ auditLog, routeEndpoint })`_                                                  |
| getEntity          | `Function`                | _provided_        | no                                                                                 | Creates the entity name of the audit log. **The default** implementation `returns` the string after /api/ and before next / if any.<br><br>_Signature<br> `function (path) {return String}`_                                                                                                           |

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

| Name           | Type       | Default | Mandatory | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| -------------- | ---------- | ------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| ext            | `Function` |         | no        | An extention point per route to **customize audit log document values**. Invoked with named arguments: <ul><li>on GET<br>`({headers, query, params}) => AuditAction`</li><li>on POST<br>`({headers, query, params, newVals}) => AuditMutation`</li><li>on PUT<br>`({headers, query, params, oldVals, newVals, diff}) => AuditMutation`<br><br>diff: `function ({diffOnly, skipDiff}) {return [originalValues, newValues]}` </li><li>on DELETE<br>`({headers, query, params, oldVals, oldVals}) => AuditMutation`</li><li>on PUT/POST and _isAction=true_ <br>`({headers, query, params, payload}) => AuditAction`</li></ul>Must `return an object (AuditAction or AuditMutation)` with any of the following **properties to override the default values**: <ul><li>Audit Action<ul><li>type `String`</li><li>entity `String`</li><li>entityId `String`/`Number`/`Null`</li><li>action `String`</li><li>data `Object`/`Null`</li></ul></li><li>Audit Mutation<ul><li>type `String`</li><li>entity `String`</li><li>entityId `String`/`Number`/`Null`</li><li>action `String`</li><li>originalValues `Object`/`Null`</li><li>newValues `Object`/`Null`</li></ul></li></ul> |
| isAction       | `Boolean`  | false   | no        | Enable/Disable creation of **action** audit log documents for **PUT/POST** requests instead of mutation.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| getPath        | `Function` |         | no        | On PUT requests, old and/or new values are fetched by injecting a **GET by id** request, based on PUT route path. When GET by id route path differs, it must be provided. <br><br>_Signature<br> `function ({ query, params }) {return String}`_                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| auditAsUpdate  | `Boolean`  | false   | no        | Force PUT request flow (edge case).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| fetchNewValues | `Boolean`  | false   | no        | On PUT requests, the **incoming payload** will be used as **newValues**. In case there are any model inconsistencies, this option will inject a **GET by id** request to **fetch the newValues**.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |

#### Disable plugin on route

By default the plugin applies to **all registered routes**. Should you need to exclude any, apply to the route:

```js
options: {
   plugins: {
      "hapi-audit-rest": false,
   },
}
```

## License

hapi-audit-rest is licensed under a MIT License.

[hapi.js]: https://hapi.dev/
