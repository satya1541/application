# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v57.0.0/ before writing any code.

## Versioning Before Updates / Builds
- **CRITICAL**: Before EVERY update or build, ALWAYS update `src/config/version.ts`:
  - Increment `otaVersion` and `releaseTag` (e.g., `5.2.3` -> `5.2.4`).
  - Update `releaseName` with a concise summary of the changes.
  - Update `releaseDate` with the current date (YYYY-MM-DD).

## OTA Updates (EAS Update)
- Always target **Android only** (`--platform android`) when pushing OTA updates. Never build or push iOS bundles unless explicitly requested.
- Standard deployment command:
  `npx eas-cli update --branch preview --environment preview --platform android --message "<message>" --non-interactive`
