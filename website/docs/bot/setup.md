# Setting up Draupnir

It is recommended to use [Pantalaimon](https://github.com/matrix-org/pantalaimon) so your management
room can be encrypted. This also applies if you are looking to moderate an encrypted room.

If you aren't using encrypted rooms anywhere, get an access token by opening Element in a
seperate browser profile or incognito tab, and log in as the bot. Then, go to "All Settings", "Help & About", and
click the little triangle next to "Access token". Copy and paste that into your config under `accessToken`.

**Note**: Do not log out, just close the window, otherwise the access token will be invalidated.

It's recommended to setup draupnir as "close" to your server as possible (latency-wise), so that it
may react swiftly to commands, and quickly apply protections.

It's also recommended to turn off ratelimiting for a draupnir bot, see [matrix-org/synapse#6286](https://github.com/matrix-org/synapse/issues/6286) and
[the synapse admin API documentation](https://matrix-org.github.io/synapse/latest/admin_api/user_admin_api.html#set-ratelimit) for more information.

**Note**: To deactivate users, move aliases, shutdown rooms, Draupnir will need to be a server
admin, and the server needs to be Synapse.

See the [sample configuration](https://github.com/the-draupnir-project/Draupnir/config/default.yaml) for documentation about individual config keys.

## Secret Management

If you need to use a secret management system, such as systemd's service credentials,
the following options are available at the command line:

- The access token can be provided with the option `--access-token-path`.
- The Pantalaimon password can be provided with the option `--pantalaimon-password-path`.

## Installation

On a high level, installing Draupnir works like the following;

1. Creating an account for draupnir.
   (Optional) Disable rate limits for that account.
2. Install draupnir, see below.
3. Configure draupnir see [further below](#post-install).
4. Start draupnir.

Draupnir can be installed in three ways, via Docker, building it yourself or via [matrix-docker-ansible-deploy](https://github.com/spantaleev/matrix-docker-ansible-deploy/blob/master/docs/configuring-playbook-bot-draupnir.md).

See the below links for corresponding installation documentation;

- [Docker](./setup_docker.md)
- [Building It](./setup_selfbuild.md)
- [matrix-docker-ansible-deploy](https://github.com/spantaleev/matrix-docker-ansible-deploy/blob/master/docs/configuring-playbook-bot-draupnir.md)

## Post-install

After installation, create a room, and ensure the draupnir has joined. This will be your "management room".

If you're using pantalaimon, this room can be encrypted. If you're not using pantalaimon, this room **can not** be encrypted.

Acquire the room ID of this room, in Element Web you can find this via `(Room Name) -> Settings -> Advanced -> "Internal Room ID"`.

In your configuration, set `managementRoom` to this Room ID, now Draupnir will only respond to commands originating from that room. If you want to upgrade your room in the future, you will have to update the configuration with it, or set it to an alias that corresponds to that room ID.

You can now start draupnir. If everything went well, it should now send a bunch of messages in that room, signalling how it is booting up, and its current status.
