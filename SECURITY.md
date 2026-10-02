# Security Policy

## Scope
This policy covers the code, configuration and workflows of `castuo-e3-001`.

## Supported versions
| Version | Supported |
|---|---|
| Default branch (latest commit) | :white_check_mark: |
| Any other branch, fork or tag | :x: |

## Reporting a vulnerability
Report privately through GitHub: **Security → Report a vulnerability** on this repository.

Single-maintainer project; targets, not contractual SLAs: acknowledgement within 7 days,
initial assessment within 30 days.

## Secrets
Secrets never belong in this repository (code, `.env` templates, scripts, docs, issues or logs).
Templates use unambiguous placeholders only. If you find a real credential, report it privately
as above and do not copy or quote the value.
