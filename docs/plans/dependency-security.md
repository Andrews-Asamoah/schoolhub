# Production dependency security baseline

The production-readiness audit identified advisories in image processing, HTTP parsing/uploads and transitive Prisma/Better Auth dependencies. This change pins patched Sharp and narrowly overrides vulnerable transitive ranges. Upstream dependency families remain on their existing major versions; the intentional exceptions are DeepmergeTS 8 and the UUID 11 CommonJS-compatible line used by ExcelJS.

| Package | Patched resolution | Reason |
|---|---|---|
| sharp | 0.35.5 | libvips/libheif/librsvg advisory fixes |
| body-parser | 2.4.0 | Compressed-body teardown denial of service |
| multer | 2.5.0 | Asynchronous filter teardown denial of service |
| mysql2 | 3.23.1 | Authentication downgrade and compressed protocol handling |
| deepmerge-ts | 8.0.0 | Recursive object graph exhaustion |
| fast-uri | 3.1.9 | URI/host/scheme canonicalisation fixes |
| qs | 6.16.1 | Stringification failure on crafted values |
| seroval | 1.6.11 | Typed-array/RegExp serialisation fixes |
| uuid | 11.1.1 | Buffer bounds validation; retains CommonJS support for ExcelJS |

SchoolHub uses PostgreSQL; MySQL2 is pulled in transitively by tool/auth packages retained in the deployment image. It is patched even though it is not the configured database driver. Version overrides should be removed when upstream dependency ranges resolve patched versions without them.

CI runs `pnpm audit --prod --audit-level high` with no advisory ignore list. Registry failure is a failed/unverified check, not a clean security result. Dependency advisories can change after a successful run; repeat the audit before a release and keep Dependabot enabled. A clean package audit does not certify base operating-system images, bundled third-party code, configuration or the running deployment.

Relevant primary advisory records:
- https://github.com/lovell/sharp/security/advisories/GHSA-wq5f-xc86-pv6w
- https://github.com/expressjs/body-parser/security/advisories/GHSA-27r3-jxmh-p828
- https://github.com/expressjs/multer/security/advisories/GHSA-q7qp-rjg7-q26m
- https://github.com/advisories/GHSA-ggr8-5vv4-36mx
- https://github.com/advisories/GHSA-3f6p-5ww8-9rcr
- https://github.com/advisories/GHSA-rgwj-5xj2-c3m3

Validation must include image decode/re-encode tests, Prisma config/client generation, authentication/database integration, real Excel output contracts and API/web runtime containers. Cross-major overrides are not accepted solely because a lockfile can be generated.
