---
"draupnir": minor
---

Add managed management/admin room support to bot mode / appservice mode.

\- Add managed management / admin room support

- Add new config options for zero touch provisioning of managed rooms:

\- managedManagementRoom and initialManager for bot mode

\- managedAdminRoom and initialManager for appservice mode

\- If managed modes are enabled while unmanaged rooms are defined the bot will
crash.

\- Fix TrustedReporters being broken by managed management rooms due to explicit
reliance on a management room in the config.

\- Add integration testing for Zero Touch Provisioning workflows.
