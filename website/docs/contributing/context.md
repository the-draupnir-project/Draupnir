## Context for developing Draupnir

alternatively context that is essential for developing
anything that uses Policy Lists.

### The synchronisation loop

In order to understand how Draupnir works you have to first understand
the sync loop of Matrix Clients. All Matrix clients have a sync loop.
The idea is that a client sends a request to the server with a
pagination token called a sync token that the server will then
respond to with any new events that the client needs to know about.
You can read more about sync [here](https://spec.matrix.org/v1.9/client-server-api/#get_matrixclientv3sync)

Draupnir uses the
[matrix-bot-sdk](https://github.com/turt2live/matrix-bot-sdk)
for its client library. The `MatrixClient` from the matrix-bot-sdk can
only provide us with the timeline portion of the `/sync` response.
Because the timeline portion of `/sync` provides a client with events
in the order in which they are received by the server (and also
as they are received by the server). As opposed to their
[mainline order](https://spec.matrix.org/v1.6/rooms/v2/#definitions)
in the DAG, then there is no way for Draupnir to rely on `/sync` to
provide an accurate representation of state for a room[^full-state].

#### Maintaining state

As Draupnir cannot rely on the `timeline` component of the `/sync`
response. Draupnir re-requests the entire state of a policy list each
time Draupnir receives a state event in that policy list.
This has to be because there is no immediate way to know whether the
new state event represents the current state of the room, or is a
stale event that has been discovered by Draupnir's homeserver
(ie a fork in the DAG maintained by another homeserver has converged
back with the one maintiained by Draupnir's own homeserver).

### Policy Lists

As in an introduction only, policy lists are Matrix rooms that contain
bans curated by one group of moderators. As these are Matrix rooms
and the bans are represented as room state, they can be shared and
introspected upon from a Matrix client, as is the case with any other
Matrix room.

#### State events

[State events](https://spec.matrix.org/latest/client-server-api/#types-of-room-events)
are a way of giving rooms generic meta-data.
They events are conveniently indexable by a key composed of both the
`type` field on the event and also a `state_key`.
These are both individually limited by a string which is no larger
than "[255 bytes](https://spec.matrix.org/latest/client-server-api/#size-limits)".
It is still unclear how implementations interpret this statement
though, so it is better to be as conservative as possible, especially
as you will still be dealing with legacy room versions.

When a state event is sent to a room, the current mapping of the tuple
`(type, state_key)` for a room is updated to refer to the new event.
It is important to be aware that because of the nature of Matrix,
everytime a state event is sent there is a possibility
for the DAG to diverge between different server's perspectives of
the room. Meaning that the state of a room can move under your feet
as these perspectives converge,
and there is only one somewhat reliable way to tell when that has
happened. Draupnir doesn't use a reliable method[^full-state],
and it is unclear if there are any clients or bots that do.

#### Policies

Policies are generic state events that are usually composed of three
parts. You should read specification about policy lists
[here](https://spec.matrix.org/latest/client-server-api/#moderation-policy-lists)
after this introduction.

- `entity`: This is the target of a given policy such as a user that
is being banned.

- `recommendation`: This is basically what the policy recommends that
the "consumer" does. The only specified recommendation in the matrix
spec is `m.ban`. How `m.ban` is interpreted is even left to
interpretation, as it depends on what the "consumer" of the policy is.
In Draupnir's case, it usually means to ban the user from any
protected room.

- `reason`: This field is used by the `m.ban` recommendation as a
place to replicate the "reason" field found when banning a user
at the room level. It's not clear whether the field will be
appropriate for all uses of `recommendation`.

Currently there are only three state events that are defined by the
spec and these were chosen to be intrinsically tied to the entities
that the policies affect. The types are of these events are
`m.policy.rule.user`, `m.policy.rule.server` and `m.policy.rule.room`.
The reason why these types are scoped per entity is possibly to make
policies searchable within `/devtools` -> `Explore room state`
of Element Web (while also re-using the entity field of a policy as
the state key).
However, this choice of indexes for mapping policies to room state
means that there can only be one `recommendation` per entity at a
time. It also leads people to assume that every policy will be created
with this combination of indexes, which in the wild isn't true.
As such for a long part of Mjolnir's history some users were
unbannable because this is also what was assumed in its implementation
of unban.

### The ban command

When the ban command is invoked, Draupnir creates a new policy in
the policy list that was selected by the user. This policy recommends
that the entity specified in the command (usually a user) is to be
banned. That is the extent of the command's responsibilities.
However, rather than waiting for Draupnir to be informed of the new
policy via the `/sync` loop, the ban command does take a shortcut
by informing Draupnir's internal model of the policy list of the new
policy immediately.

### Policy application in Draupnir

When Draupnir finds a new policy from a `/sync` response, and Draupnir
has re-requested the room state for the policy list Draupnir will
begin synchronising policies with with the protected rooms.
Draupnir starts synchronising rooms by visiting the most recently
active room first.

### A history of moderation projects

Mjolnir was originally created by
[Travis Ralston](https://github.com/turt2live) as a good enough
solution temprarily made permanent.
The abstract architecture of Mjolnir remains today and we are
thankful for good foundations, and significantly
[policies](https://spec.matrix.org/latest/client-server-api/#moderation-policy-lists)
that were
[proposed](https://github.com/matrix-org/matrix-spec-proposals/pull/2313)
by [Matthew Hodgson](https://github.com/ara4n).

There were several other similar solutions known to us that were
developed and deployed at the same time as Mjolnir in the earlier days
and either directly or indirectly had influence on things to come.
Notably [Fly Swatter](https://github.com/serra-allgood/matrix-fly-swatter)
and [Luna](https://gitlab.com/Gnuxie/luna).

After a period of maintenance, Mjolnir was then developed by other
contributors from Element who restructured the project, tackled
usability concerns and would go on to produce a multi-tenancy
appservice mode of deployment called "Mjolnir for all".
With the eventual aim of integrating the functions of Mjolnir
transparently with both homeservers and clients.

This effort is now continued by the Matrix community in the form
of Draupnir and [MTRNord](https://github.com/MTRNord)'s
[Draupnir4all deployment](https://docs.draupnir.midnightthoughts.space/).

[^full-state]: matrix-bot-sdk could be modified to sync with
`full_state` set to true. This has been
[attempted](https://github.com/turt2live/matrix-bot-sdk/pull/215)
but the maintainer of the matrix-bot-sdk is opposed to the idea.
