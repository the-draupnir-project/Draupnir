<!--
SPDX-FileCopyrightText: 2024 Gnuxie <Gnuxie@protonmail.com>

SPDX-License-Identifier: CC-BY-SA-4.0
-->

# Matrix basic types

Do you type [Matrix](https://matrix.org) roomIDs, userIDs, and eventIDs as
`string`?

Have you ever accidentally mixed the two up?

Well fear no more, this library provides distinct types for each kind of
identifier, and also a wrapper for the various ways of referring to rooms.

```typescript
async function acceptInvitation(
  inviteSender: StringUserID,
  room: MatrixRoomID
): Promise<Result<void>> {
  console.log(
    `accepting invitation from ${inviteSender} to ${room.toPermalink()}`
  );
  return await client.joinRoom(room.toRoomIDOrAlias(), room.getViaServers());
}
```
