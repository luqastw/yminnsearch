#!/usr/bin/env bash
set -euo pipefail

origem="$(dirname "$(readlink -f "$0")")"
destino="$HOME/.config/systemd/user"

mkdir -p "$destino"
cp "$origem/precos-pc.service" "$origem/precos-pc.timer" "$destino/"
systemctl --user daemon-reload
systemctl --user enable --now precos-pc.timer
systemctl --user list-timers precos-pc.timer --no-pager
