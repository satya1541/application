npx eas-cli build --platform android --profile preview

# OTA Update command (Android Preview):
npx eas update --channel preview --platform android --environment preview --message "your update message here"

# View recent updates:
npx eas update:list