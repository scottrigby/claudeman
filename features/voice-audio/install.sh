#!/bin/sh
set -e

echo "Installing voice audio packages..."

apt-get update
apt-get install -y --no-install-recommends \
  alsa-utils \
  sox \
  libsox-fmt-all \
  pulseaudio-utils \
  libpulse0 \
  libasound2-plugins
apt-get clean
rm -rf /var/lib/apt/lists/*

# Route ALSA default device through PulseAudio
printf 'pcm.!default pulse\nctl.!default pulse\n' > /etc/asound.conf

# Do not auto-spawn a local PA daemon; always connect to remote (host) server
mkdir -p /etc/pulse
printf 'autospawn = no\ndaemon-binary = /bin/true\n' > /etc/pulse/client.conf

echo "Voice audio packages installed."
