# Delivery verification � 28 October 2026

The release has been verified locally using production Docker images and an isolated restored database. It is not deployed to Render.

## Confirmed policy

Registration creates a Business Admin owner. Super Admin is reserved for platform operators. The owner explicitly confirmed this policy on 28 October; the conflicting checklist rule does not apply.

## Evidence

- Release .NET and Next.js container builds passed; TypeScript passed.
- Runtime dependency audit reported zero vulnerabilities; .NET package audit reported no vulnerable packages.
- Backend integration: 12 passed. Driver integration: 1 passed.
- Production browser checks reported passes for branding, request/security headers, landing light/dark on phone/desktop, language switching, password-reset layouts, driver login/mobile navigation, and sidebar destinations for all eight tested roles.
- The first light-theme record test failed because it required exactly two inset shadows; the focused light-theme field has three. Removed that implementation-detail assertion. Its full view/edit/delete workflow rerun passed; dark-theme workflow passed in the initial run.
- Public contrast: home, login, registration, forgot-password and reset-password each reported zero contrast failures in light and dark themes.
- Completed browser runs: initial suite 29 passed / 1 brittle assertion failed (9 minutes); follow-up suite 3 passed with exit code 0 (2.6 minutes), covering the corrected record workflow and both public contrast scans. Remote CI has not run.
- Logical restore and pgBackRest physical restore succeeded. A row written after the base backup was recovered from archived WAL. Restored organization/customer/trip/invoice/payment counts and a known invoice value matched. Seven-day retention is configured, not soak-tested for seven days.
- Local environment files and development API settings were absent from release image paths checked.
- Render Blueprint passed JSON-schema validation. Actual Render provisioning has not occurred.

## Publication gates

A fetch recovered a missing Git object and `git diff --check` passed. Remote main has seven commits beyond the local base, including a separate local-storage implementation. Those commits have not been merged or overwritten. Reconcile the release source on an isolated review branch before publishing; the tested Docker release must not be confused with the current remote main.

Render account authorization, paid-resource cost acceptance, private SMTP settings, public health/TLS verification, real password-reset delivery and managed-database restore rehearsal remain required. Public OAuth also needs its certificate and registered callback URLs. No production database or paid resource was created.

The broader requested work packages are not all implemented. See render-deployment.md for their explicit scope limits and deployment steps.

## New release repository

The owner requested a full release in Yarafat2001/Tranzora_Transport_Live. A clean initial snapshot is prepared from the tested application source, without importing the previous repository's history or its later local-storage implementation. The original checkout and remote are preserved. Latest typography checks: 10 browser checks passed; .NET build, TypeScript and 12 isolated API integration checks passed. Render remains pending account connection and paid-resource review.


## Reported runtime and IDE issues � 29 October 2026

Installed and verified libgssapi-krb5-2 in both Docker runtime stages. Restored dashboard and audit routes omitted during endpoint extraction. Cleared inherited HTTP/HTTPS port settings for the explicitly bound internal API. Pinned VS Code to backend/Tranzora.slnx and disabled the ignored temporary probe project created during verification. Actual API compilation includes Program.cs, WebSecurity.cs, EndpointExtensions.cs and SchemaMigrations.cs. Local .NET build and TypeScript passed; isolated PostgreSQL backend integration passed 12 checks and driver integration passed 1 check. The API runtime image contains libgssapi_krb5.so.2. Combined image verification and remote deployment are tracked separately; no public deployment success is implied by a local build.
