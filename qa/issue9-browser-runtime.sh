#!/bin/bash
set -euo pipefail
# Rootless QA-only system libraries, extracted into a private scratch directory.
# No system package install, container reconfiguration or platform daemon changes.
repo="$PWD"
libs=$(mktemp -d)
trap 'rm -rf "$libs"' EXIT
cd "$libs"
mkdir -p lists/partial
apt-get -o Dir::State::lists="$libs/lists" update
apt-get -o Dir::State::lists="$libs/lists" download libxi6 libxrender1 libbsd0 libmd0 libasound2 libatk-bridge2.0-0 libatk1.0-0 libatspi2.0-0 libcairo2 libcups2 libdbus-1-3 libdrm2 libgbm1 libglib2.0-0 libnspr4 libnss3 libpango-1.0-0 libx11-6 libxcb1 libxcomposite1 libxdamage1 libxext6 libxfixes3 libxkbcommon0 libxrandr2 libexpat1 libxau6 libxdmcp6 libwayland-server0 libxshmfence1 libpixman-1-0 libfontconfig1 libfreetype6 libharfbuzz0b libthai0 libdatrie1 libgraphite2-3 libpng16-16 libbrotli1 fonts-wqy-zenhei
for package in *.deb; do dpkg-deb -x "$package" root; done
export LD_LIBRARY_PATH="$libs/root/usr/lib/aarch64-linux-gnu:$libs/root/lib/aarch64-linux-gnu:${LD_LIBRARY_PATH:-}"
export FONTCONFIG_FILE="$libs/fonts.conf"
cat > "$FONTCONFIG_FILE" <<FONTS
<?xml version="1.0"?><!DOCTYPE fontconfig SYSTEM "fonts.dtd"><fontconfig><dir>$libs/root/usr/share/fonts</dir><cachedir>$libs/font-cache</cachedir></fontconfig>
FONTS
cd "$repo"
node --experimental-strip-types qa/issue9-browser.mjs
