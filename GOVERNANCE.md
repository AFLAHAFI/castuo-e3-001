# Governance

## Roles

- **Maintainer:** [@Traky12](https://github.com/Traky12) (Gregorio Jiménez Bodes). Reviews and merges pull requests, publishes releases and decides the roadmap.
- **Contributors:** anyone whose contribution has been accepted. Listed in [CONTRIBUTORS.md](CONTRIBUTORS.md).
- **Independent reviewers (E3-001):** people outside the authoring path who reproduce the protocol and sign a review under [PROTOCOL.md](PROTOCOL.md).

## How decisions are made

- Small changes: a pull request with passing Linux CI and maintainer approval.
- Behaviour or format changes (`e3.bundle.v1`, CLI flags, exit codes, Action inputs): an issue or Discussion first, then a pull request with tests and a CHANGELOG entry.
- Releases follow Semantic Versioning. Before `1.0` the format and CLI may change; every change is recorded in [CHANGELOG.md](CHANGELOG.md).

## Authority boundary

This repository decides what `e3bundle` and the public E3-001 protocol do. It does not decide the technical state or promotion of the private CASTÚO-SYSTEM core; that authority stays in the private canonical repository. A passing verification, a merged pull request or green CI is not certification, independent validation or production authorization.

## AI-assisted development

The maintainer uses AI coding assistants. Every AI-assisted change goes through the same pull request, tests and Linux CI as any other, is reviewed by the maintainer before merge, and must not add claims the repository does not evidence. No AI tool approves or merges changes. Contributor rules are in [CONTRIBUTING.md](CONTRIBUTING.md#ai-assisted-contributions).

## Becoming a maintainer

Sustained, high-quality contributions and reviews may lead to an invitation to co-maintain. Any change to this governance is made by pull request to this file.
