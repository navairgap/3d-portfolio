# security response header verification

The portfolio sends a small set of browser-facing response headers from
`next.config.ts`. This is a baseline, not a substitute for reviewing
the application or its dependencies.

## Expected responses

The site is a single-page experience — check the home page after deploying:

```sh
curl -sSI https://3d-portfolio-nav-8975.vercel.app/
```

The responses should include:

| Header | Expected value | Purpose |
| --- | --- | --- |
| `X-Content-Type-Options` | `nosniff` | Prevent MIME-type sniffing |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | Limit cross-origin referrer details |
| `X-Frame-Options` | `DENY` | Prevent framing by other sites |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=()` | Disable browser features this portfolio does not need |

The `X-Powered-By` header should be absent.

## Regression checks

After changing headers or framework configuration, verify that:

- The home page and project routes still return their expected status codes.
- WebGL loads and the static navigation remains available if WebGL fails.
- Local images, Draco/KTX2 assets, and fonts still load.
- The site is not embedded by an intended parent page before retaining
  `X-Frame-Options: DENY`.

A restrictive Content Security Policy is intentionally not included here.
The portfolio uses framework-generated scripts, external font resources, and
WebGL assets; a CSP should only be introduced after the required origins and
inline execution paths have been inventoried and tested in report-only mode.
