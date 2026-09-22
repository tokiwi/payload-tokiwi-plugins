# Security policy

## Reporting a vulnerability

Report it privately through GitHub's
[private vulnerability reporting](https://github.com/tokiwi/payload-tokiwi-plugins/security/advisories/new).
Do not open a public issue and do not disclose the details elsewhere until a fix is
released.

Include what is needed to reproduce it: the affected package and version, the Payload
version, and the shortest sequence of steps that shows the problem. We aim to acknowledge
a report within five working days.

## Supported versions

No package is published yet. Once a package ships, fixes land on its latest published
minor. npm versions are immutable, so a fix is always a new version — never a replacement
of the affected one.

## Scope

These packages run inside a consuming Payload application. A report is in scope when a
package weakens that application: an access-control bypass in a field or collection it
adds, an option that exposes data through the admin panel or the REST and GraphQL APIs, a
template that renders unescaped input.

Out of scope: vulnerabilities in Payload itself — report those to
[payloadcms/payload](https://github.com/payloadcms/payload/security) — and anything that
requires an already-compromised admin account.
