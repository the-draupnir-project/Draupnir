---
name: Draupnir Bot Mode Bug Template
about: A template for a bug encountered in Bot Mode
title: "Draupnir will not X while using the Z command"
labels: ["bug"]
---

_It is not required to fill out each of these fields, your bug will still be
considered, even if you do not follow the template. However, please do try
provide as much detail as possible to save us time._

**How is Draupnir setup?**

_Try to include any details about non default configuration or any context to
its use that might be relevant to the issue. If Draupnir has crashed, then these
will be printed at the end of the log, you should copy that output here._

I was using Draupnir with the `roomStateBacking` store enabled. All other
configuration options were default.

**What were you trying to achieve?**

_Include details about what you were trying to accomplish without workarounds._

I was trying to ban a server from my rooms by using the ban command.

**What steps did you take to encounter the bug**

_Try to describe clear concise steps or any details about how you encountered
the bug._

1. I ran `!draupnir ban server.example.com coc spam` in the management room.
2. I checked my protected rooms
3. I could not see the server ACL event updating.

**What is the bug or what did you expect to happen instead?**

_Try describe the outcome you would expect, or explicitly state what the bug
is_.

I expected Draupnir to have changed the `m.room.server_acl` event and ban the
server from all my rooms.
