# Reverse proxy and CDN

Use two domains, for example `panel.example.com` and `cdn.example.com`, with valid HTTPS certificates. Configure DNS to your reverse proxy. Replace the origin host below with the server running Docker Compose.

| Domain | Upstream | Purpose |
| --- | --- | --- |
| `panel.example.com` | `http://ORIGIN_HOST:8080` | Administration panel and authenticated API |
| `cdn.example.com` | `http://ORIGIN_HOST:8081` | Public manifests and release files |

## Zoraxy or another reverse proxy

Preserve the original Host header, including a nonstandard port where applicable, and forward the usual proxy headers. Permit long-lived server events and resumable TUS uploads on the panel route. Set upload limits and timeouts to match the packs you distribute. The public route must target the file listener; keep the two upstreams separate.

Set these domains in `.env` before installation, or update them in the panel's setup wizard. The configured files URL is embedded in published manifests and launcher configurations. A plain HTTP URL with a port is supported for isolated LAN validation.

## Cloudflare or another cache

Active manifests change with every publication and rollback. Bypass caching for:

- `/*/packpanel.json`
- `/*/index.json`
- `/*/index.php`

Files under `/*/releases/*` are immutable and can use the origin's long-lived cache headers. Do not cache authenticated panel/API responses. Respect the origin headers instead of forcing a cache-everything rule over both domains.

Programmatic clients cannot answer browser challenges. Configure public distribution paths so downloads do not require a JavaScript challenge, CAPTCHA or Access login. Keep administrative access policies separate. Use trusted certificates; clients should verify TLS.

## Verification

After publishing a disposable pack, check the real URLs:

```sh
bash scripts/verify-proxy.sh \
  https://panel.example.com \
  https://cdn.example.com/example-pack/packpanel.json \
  https://cdn.example.com/example-pack/releases/RELEASE_ID/config/example.txt
```

The release file must exist and contain at least five bytes for the range check. This verifies health, a JSON manifest, cache policy and HTTP Range through the proxy. Desktop validation should additionally download the generated launcher and start the game using the public distribution domain. See [release checks](../README.md#integration-checks).
