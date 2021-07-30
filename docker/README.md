## Testing mjolnir with docker

At the moment a test environment for mjolnir can be setup by running
`./mjolnir_testing.sh` from the parent directory. This script  will use
the `docker-compose.yaml` in the parent directory.

This sets up synapse container with a user for mjolnir to use.
The container for mjolnir, creates and joins the moderation room
which has to be specified with an alias in the config under `managementRoom`.

Currently there are problems with this setup as the mjolnir image has
to be rebuilt with every source change. This can be avoided
if we can get the docker-compose to use
`docker/Dockerfile.mjolnir.development`.
There is also the problem of stopping data from
synapse (and mjolnir?) persisting across startups which
is currently managed using the `mjolnir_testing.sh` script.
