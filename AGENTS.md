# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v57.0.0/ before writing any code.

## OTA Updates (EAS Update)
- Always target **Android only** (`--platform android`) when pushing OTA updates. Never build or push iOS bundles unless explicitly requested.
- Standard deployment command:
  `npx eas-cli update --branch preview --environment preview --platform android --message "<message>" --non-interactive`

