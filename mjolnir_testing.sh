#!/bin/bash
# This script only exists so that the persitent state in volumes
# is removed, if you find a better way to do it then please
# help.
cleanup () {
    echo "Removing old container"
    set +e
    # Couldn't find a better way to remove their persisted state
    # unfortunately
    docker container rm mjolnir_mjolnir_1
    rm -f docker/synapse-data/homeserver.db
    set -e
}

case "$1" in
    up)
        cleanup
        # We rebuild this image each time so it has updated sources
        # There is a way to mount the sources in a volume.
        docker-compose build mjolnir
        exec docker-compose up
        ;;
    down)
        exec docker-compose down
        ;;
    *)
        echo "Usage: $SCRIPTNAME {up|down}" >&2
        exit 3
        ;;
esac
