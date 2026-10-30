#!/usr/bin/env bash
# Source ONLY from the disposable validation copy. Never install system packages.
set -euo pipefail
[[ ${FR033_DISPOSABLE_VALIDATION:-} == 1 && $PWD == /tmp/praetor-app-validate-*/project ]] || { echo 'Disposable validation copy required' >&2; return 2; }
[[ $(id -u) != 0 ]] || { echo 'Nonroot runtime required' >&2; return 2; }
source /etc/os-release
[[ $ID == debian && $VERSION_ID == 12 && $(uname -m) == aarch64 ]] || { echo 'Supported runtime: Debian12 arm64 only' >&2; return 2; }
export FR033_RUNTIME_PREFIX
FR033_RUNTIME_PREFIX=$(mktemp -d /tmp/fr033-browser-runtime-XXXXXX)
echo "RUNTIME_PREFIX=$FR033_RUNTIME_PREFIX uid=$(id -u) OS=$PRETTY_NAME arch=$(uname -m)"
export PLAYWRIGHT_BROWSERS_PATH="$FR033_RUNTIME_PREFIX/browsers"
export XDG_CACHE_HOME="$FR033_RUNTIME_PREFIX/cache"
mkdir -p "$FR033_RUNTIME_PREFIX"/{lists/partial,archives/partial,root,cache}
for candidate in chromium chromium-browser google-chrome; do command -v "$candidate" || true; done
for cache in /home/node/.cache/ms-playwright /root/.cache/ms-playwright /opt/ms-playwright; do
  [[ ! -r $cache ]] || ls -d "$cache"/* 2>/dev/null || true
done
if [[ -f qa/fr033-browser-dependencies.json && ${FR033_RESOLVE_DEPENDENCIES:-0} != 1 ]]; then
  node qa/fr033-browser-packages.mjs restore
else
  # Isolated APT indexes/cache; authenticated by Debian's existing archive keyring.
  # --download-only never invokes dpkg or installs anything. No root/sudo.
  sed 's|http://|https://|g' /etc/apt/sources.list.d/debian.sources > "$FR033_RUNTIME_PREFIX/sources"
  # This minimal image has no system CA bundle. Use Node's bundled trusted CAs,
  # with full TLS verification; never disable certificate or signature checks.
  node -e 'require("fs").writeFileSync(process.env.FR033_RUNTIME_PREFIX+"/ca.pem",require("tls").rootCertificates.join("\n"))'
  # Do not load image-level APT cleanup hooks that reference /var/cache/apt.
  mkdir -p "$FR033_RUNTIME_PREFIX/apt-parts"
  printf 'Dir::Etc::parts "%s/apt-parts"; Dir::Etc::main "%s/absent.conf";\n' "$FR033_RUNTIME_PREFIX" "$FR033_RUNTIME_PREFIX" > "$FR033_RUNTIME_PREFIX/apt.conf"
  export APT_CONFIG="$FR033_RUNTIME_PREFIX/apt.conf"
  apt_options=(-o "Dir::State::lists=$FR033_RUNTIME_PREFIX/lists" -o "Dir::Cache::archives=$FR033_RUNTIME_PREFIX/archives" -o "Dir::Etc::sourcelist=$FR033_RUNTIME_PREFIX/sources" -o Dir::Etc::sourceparts=- -o Debug::NoLocking=1 -o "Dir::Log=$FR033_RUNTIME_PREFIX" -o APT::Get::List-Cleanup=0)
  # The copied source retains Debian's Signed-By keyring; unauthenticated packages fail.
  mv "$FR033_RUNTIME_PREFIX/sources" "$FR033_RUNTIME_PREFIX/sources.sources"
  apt_options[5]="Dir::Etc::sourcelist=$FR033_RUNTIME_PREFIX/sources.sources"
  apt_options+=(-o "Acquire::https::CaInfo=$FR033_RUNTIME_PREFIX/ca.pem" -o APT::Update::Error-Mode=any)
  apt-get "${apt_options[@]}" update
  apt-get "${apt_options[@]}" --download-only --no-install-recommends --yes install libglib2.0-0 libnss3 libnspr4 libdbus-1-3 libatk1.0-0 libatk-bridge2.0-0 libexpat1 libatspi2.0-0 libx11-6 libxcomposite1 libxdamage1 libxext6 libxfixes3 libxrandr2 libgbm1 libxcb1 libxkbcommon0 libasound2 libcups2 libcairo2 libpango-1.0-0 fonts-liberation
  node qa/fr033-browser-packages.mjs lock
fi
node qa/fr033-browser-packages.mjs extract
export LD_LIBRARY_PATH="$FR033_RUNTIME_PREFIX/root/usr/lib/aarch64-linux-gnu:$FR033_RUNTIME_PREFIX/root/lib/aarch64-linux-gnu${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
export FONTCONFIG_PATH="$FR033_RUNTIME_PREFIX/root/etc/fonts"
export FONTCONFIG_FILE="$FR033_RUNTIME_PREFIX/fonts.conf"
printf '<fontconfig><dir>%s/root/usr/share/fonts</dir><cachedir>%s/fontcache</cachedir></fontconfig>\n' "$FR033_RUNTIME_PREFIX" "$FR033_RUNTIME_PREFIX" > "$FONTCONFIG_FILE"
export FR033_RUNTIME_MANIFEST="$PWD/qa/fr033-browser-dependencies.json"
echo 'Runtime prepared; task-scoped library/font/cache paths only.'
