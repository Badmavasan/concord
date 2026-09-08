#!/bin/sh
# Runs as root only long enough to make sure the bind-mounted data directory is
# writable by the unprivileged "node" user, then drops privileges.
set -e
DATA_DIR="${DATA_DIR:-/data}"
mkdir -p "$DATA_DIR/uploads"
if [ "$(stat -c %u "$DATA_DIR")" != "$(id -u node)" ]; then
  chown -R node:node "$DATA_DIR"
fi
exec su-exec node "$@"
