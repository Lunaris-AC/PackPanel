# Security reporting

Please contact the repository maintainer privately to report a vulnerability. If GitHub's **Security → Report a vulnerability** option is available, use it. Do not put credentials, exploit details involving a live deployment, session tokens or private backups in public issues.

Include the affected source revision, route or runtime, steps to reproduce, expected impact and sanitized evidence. Current maintenance targets the latest source on the default branch.

Deployment credentials are generated per installation. The admin/API listener and public distribution listener serve different purposes; configure HTTPS and access policies accordingly. See [security architecture](docs/SECURITY.md) and [operations](docs/OPERATIONS.md).
