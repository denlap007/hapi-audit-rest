# hapi-audit-rest

[Hapi.js] plugin that **creates audit records** for **rest API calls** of a Hapi.js server. Records can be submitted to an auditing service or stored to the DB directly.

# Requirements

Works with Hapi v17 or higher

# Installation

`npm i -S hapi-audit-rest`

# About

This is a small plugin that can generate information for auditing purposes. A unit of information for that purpose is called an auditing record.

For REST APIs, **CRUD operations of users on resources** can be monitored. For every request, an **auditing event** is emitted. An event handler is provided to handle the event.

Two events are pre-configured:

- **SEARCH**
- **MUTATION**

All **GET requests** are considered **SEARCH events**. A Mutation event can be one of **POST, PUT, DELETE requests**. An event is also correlated with an ACTION. For Mutation events:

- **PUT** request is an **UPDATE** action
- **POST** request is a **CREATE** action
- **DELETE** request is a **DELETE** action

For mutations, the affected entity, its id and the values (payload) before and after the action are recorded. A diff function computes the differences observed because of the action. Users can bind their own function implementations, although a reference implementation may be provided in the future for completeness.

# Features

# Usage

# Options

# License

hapi-audit-rest is licensed under a MIT License.

[hapi.js]: https://hapi.dev/
