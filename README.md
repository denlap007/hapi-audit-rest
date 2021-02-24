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
const data = {
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
const data = {
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
const data = {
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
const data = {
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
const data = {
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

## Features

## Options

## License

hapi-audit-rest is licensed under a MIT License.

[hapi.js]: https://hapi.dev/
