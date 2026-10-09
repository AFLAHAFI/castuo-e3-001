# Public adoption roadmap

**Repository:** `Traky12/castuo-e3-001`  
**Snapshot:** 2026-10-09  
**Status:** `IN PROGRESS`  
**Target:** sustainable external use; Starstruck ×3 (512 stars on this repository) is a visibility milestone, not a quality or assurance metric.

## Principles

1. A clean-clone quickstart must work before broad promotion.
2. Collect feedback from **five independent external testers** before any wider promotional push. They should not be the author and should test without private repository access, private credentials or synchronous help.
3. A synthetic demo must never be presented as external replay, independent review or evidence about CASTÚO-SYSTEM. The demo output must be `DEMO_VALIDATED`; G2 must be `BLOCKED`.
4. Never buy, exchange, automate or otherwise manipulate stars. Do not spam communities or ask for stars as a condition of help.
5. Every public claim remains bounded by code, tests and evidence. A star count is not proof of adoption, validation, certification, production maturity or commercial traction.

## Phase 0 — Clean-clone demo and claim firewall

- [ ] Python 3.11–3.13 Linux CI passes, including generic `e3bundle` and S-001A synthetic negative cases.
- [ ] From a clean clone, the generic signed `valid` bundle returns `VERIFIED` / exit 0.
- [ ] The generic signed `tampered` bundle returns `FAILED` / exit 1.
- [ ] The S-001A synthetic bundle returns `DEMO_VALIDATED`, `g2_eligible: false`; G2 returns `BLOCKED`.
- [ ] README, protocol and release notes distinguish the generic CLI from independent S-001A replay.
- [ ] Review vulnerability, dependency and secret-scan checks before tagging another release.

## Phase 1 — First five external testers (before wider promotion)

Recruit five developers or assurance practitioners who are not involved in authoring this repository. Give each the public `v0.1.0` instructions and ask them to complete the commands without live help.

Record, without collecting secrets or private data:
- operating system and Python version;
- exact command and exit code;
- expected versus observed outcome;
- reproducible friction or defect;
- whether they could explain the verification limits in their own words.

Open a separate issue for each reproducible defect. Do not count the author's own run, repository CI, bot activity or a synthetic identity as an external tester.

## Phase 2 — Community backlog

These tagged issues are the public work queue. Prefer small, testable contributions; do not merge changes solely to increase activity.

- [#22 — Clean-install guide for Windows/macOS/Linux](https://github.com/Traky12/castuo-e3-001/issues/22)
- [#23 — Cross-platform CI](https://github.com/Traky12/castuo-e3-001/issues/23)
- [#24 — Trusted-key bootstrap and rotation](https://github.com/Traky12/castuo-e3-001/issues/24)
- [#25 — Reusable GitHub Actions example](https://github.com/Traky12/castuo-e3-001/issues/25)
- [#26 — Threat model and security non-goals](https://github.com/Traky12/castuo-e3-001/issues/26)

## Phase 3 — Demonstrated adoption and distribution

After the five-testers gate is complete:
- fix onboarding blockers and publish the results of the tester exercise with appropriate redaction and consent;
- publish concise technical walkthroughs showing both verification and rejection of a deliberately modified bundle;
- share those resources only in relevant communities and in compliance with their rules;
- consider PyPI distribution or further action integrations only after demand, interface stability, packaging tests and release provenance justify them;
- maintain versioned release notes, compatibility information and a rollback path.

## Starstruck milestones

These stretch goals refer to **this single repository**, not the sum of stars across the CASTÚO ecosystem.

| Milestone | Stars | Interpretation |
|---|---:|---|
| Initial threshold | 16 | First visibility milestone |
| Bronze | 128 | Broader discovery |
| Silver / Starstruck ×3 | 512 | Target achievement |

These are goals, not forecasts. Do not treat stars as evidence of product quality or use artificial engagement practices to reach them.

## Monthly scorecard

Track stars and repository traffic as discovery indicators alongside:
- number of independent clean-clone testers and completed runs;
- actionable issues reported and resolved;
- external contributors and substantive review comments;
- CI reliability on supported Python versions;
- release installs/downloads if the package is later published;
- unresolved high-severity defects and claim-boundary violations.

## Stop conditions

Pause promotion if the valid demo fails, a tampered bundle passes, the synthetic S-001A demo becomes G2-eligible, required CI is failing, a material vulnerability remains unresolved, or public wording overstates the implemented scope. Resume only after the relevant corrective evidence is recorded.
