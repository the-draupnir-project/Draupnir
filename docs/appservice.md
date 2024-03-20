Draupnir can be run as an appservice, allowing users you trust or on your homeserver to run their own Draupnir without hosting anything themselves.
This module is currently alpha quality and is subject to rapid changes,
it is not recommended currently and support will be limited.

Usage of the [matrix-docker-ansible-deploy](https://github.com/spantaleev/matrix-docker-ansible-deploy/blob/master/docs/configuring-playbook-bot-draupnir.md) role for Draupnir for all is recommended instead of trying to deploy Draupnir for all from scratch as much more support is offered when taking this route. Especially if not deviating from defaults.

# Prerequisites

This guide assumes you will be using Docker and that you are able to provide a postgres database for Draupnir to connect to in application service mode.

Please note that Draupnir in appservice mode does not support E2EE nor support use of an E2EE proxy like [pantalaimon](https://github.com/matrix-org/pantalaimon) as there is currently no proxy for appservices like there is for /sync

# Setup

1. Create a new temporarily public Matrix room that will act as a combined Policy List and Management room for the appservice.
   FIXME: Currently required to be aliased.
   FIXME: Should ideally be an Admin Room and a separate Policy list, but waiting for command refactor before doing that.

2. Give the room from step 1 an alias that you put in your configuration that you will create later. `$MANAGEMENT_ALIAS` is how we will refer to this room in the remaining instructions.
   FIXME: Make it so we can just invite the bot to the room and give the bot a room ID in it’s config instead. (Inviting the bot to the room makes the bot think you want to provision not just grant it access to it’s own management room.)

3. Decide on a spare local TCP port number to use that will listen for messages from the matrix homeserver. Take care to configure firewalls appropriately. We will call this port `$MATRIX_PORT` in the remaining instructions.

4. Create a `config/config.appservice.yaml` file that can be copied from the example in `src/appservice/config/config.example.yaml`. Your config file needs to be accessible to the docker container later on. To do this you could create a directory called `draupnir-data` so we can map it to a volume when we launch the container later on. The `$MANAGEMENT_ALIAS` created earlier on is added to this file under the `adminRoom` key in the config. Please note that the whole config is needed to keep Draupnir happy D4A happy. It will crash if any non-commented out in the template part is missing.

5. Generate the appservice registration file. This will be used by both the appservice and your homeserver.
   Here, you must specify the direct link the Matrix Homeserver can use to access the appservice, including the Matrix port it will send messages through (if this bridge runs on the same machine you can use `localhost` as the `$HOST` name):

   `docker run --rm -v /your/path/to/draupnir-data:/data gnuxie/draupnir appservice -r -u "http://$HOST:$MATRIX_PORT" -f /data/config/draupnir-registration.yaml`

6. Create a `config/config.production.yaml` file that can be copied from the example in `config/default.yaml` just like in step 4. The file also needs to be accessible to the container so whatever path is used for `config/config.appservice.yaml` can be reused to also house this file.

The provisioned Draupnirs only inherit a subset of the configuration options that are accessible to Bot mode Draupnir. Those are the following options. If there's `:` as a suffix to a config option that means there are sub options like how under commands in the default config you also find `additionalPrefixes:` with a value of `draupnir`.
```
logLevel
syncOnStartup
fasterMembershipChecks
automaticallyRedactForReasons:
protectAllJoinedRooms
backgroundDelayMS
commands:
protections:
```

7. Start the application service `docker run -v /your/path/to/draupnir-data/:/data/ gnuxie/draupnir appservice -c /data/config/config.appservice.yaml -f /data/config/draupnir-registration.yaml -p $MATRIX_PORT --draupnir-config /data/config/production.yaml`

8. Copy the `draupnir-registration.yaml` to your matrix homeserver and refer to it in `homeserver.yaml` like so:
```
  app_service_config_files:
    - "/data/draupnir-registration.yaml"
```

# Post Install Setup and Configuration.

If you successfully followed Steps 1-8 or got to the point your running the bot through other means congratulations. Then there are some post install steps and configuration that you should apply to your appservice

1. If your successfully at this point it’s assumed that your `draupnir-moderation` or `draupnir-main` bot is in the admin room (the room with designated by `$MANAGEMENT_ALIAS`). So go back up and follow those steps if you haven't got there yet.

2. Set your appservice management room to private, if you didn't already. Anyone with access to this room can manage access to the appservice, so be careful who you share this with.

3. Set your appservice to have powerlevel 50 or greater in the appservice management room as to allow it to write policies into this room. The bot uses these policies to control who is allowed to use the bot.

4. Decide if you want to allow provisioning per homeserver or per user. If you choose to only provision per user skip to step 6.

5. Allow provisioning per homeserver. To provision per homeserver you write in your control room /plain MXID_OF_APPSERVICE_HERE allow @*:homeserver_to_allow

6. Allow provisioning per user. To Provision per user you write in your control room /plain MXID_OF_APPSERVICE_HERE allow MXID_TO_ALLOW
FIXME: If the client is being dumb and adding escapes to lone instances of * in the command strip them out so you don't have to mandate /plain use to guarantee the client doesn’t screw the user over.

7. Provisioning a Draupnir is done via inviting your main draupnir into a room. If the user who did it is allowed to Draupnir rejects the invite and provisions a Draupnir shortly and invites the user to the newly created policy list and control room for this Draupnir.
