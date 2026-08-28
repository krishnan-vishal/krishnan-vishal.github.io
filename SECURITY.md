# Security at GPIR

FINTECHOSIS / GPIR is a static website hosted by GitHub Pages. It is designed
with reference to recognized security and privacy practices, but it is not
represented as certified, regulator-approved, independently audited,
unhackable or 100% secure.

## Reporting a security issue

Please do not include passwords, access tokens, private keys, personal data or
other sensitive details in a public issue. Use the repository owner's GitHub
Security Advisory or private reporting capability when it is enabled. If that
capability is unavailable, open a minimal public issue containing only the
non-sensitive description needed to request a private contact channel.

Security reports may cover:

- malicious or unexpected code
- content tampering
- exposed credentials
- fraudulent or misleading source links
- broken security controls
- reproducible vulnerabilities in repository tooling

Reports are reviewed by the repository maintainers. No response time, remedy or
security outcome is guaranteed.

## Current controls

- GitHub Pages HTTPS and its platform-managed transport controls
- Version-controlled source, content and generated artifacts
- Source-domain verification through the GPIR trust engine
- Structured content validation and internal HTML-link validation
- Least-privilege repository security checks through GitHub Actions
- No public accounts, password collection, payment collection or file uploads

## Platform limitations

GitHub Pages does not provide this repository with custom server response
headers such as Content-Security-Policy, X-Frame-Options, Permissions-Policy or
Referrer-Policy. Their absence is documented rather than represented as an
implemented control. A future approved edge or hosting layer could provide
those headers without requiring paid services.

## Scope and privacy

GPIR does not ask visitors to create accounts and the repository contains no
intended facility for collecting passwords or payment information. The site
uses limited browser storage for interface preferences and makes documented
requests to selected external resources. This statement does not claim that
normal web-server connection metadata is absent.

## Content integrity

Source verification indicates that a cited URL matches a maintained source
registry entry. It does not guarantee that the external publication is safe,
accurate or permanently available. Content review and source trust are separate
statuses. Unresolved content must remain unverified until reviewed.

## Zero-cost policy

Current controls use GitHub Pages, GitHub Actions, browser capabilities and
repository-native or open-source tooling. No paid security service is required
for the current implementation.
