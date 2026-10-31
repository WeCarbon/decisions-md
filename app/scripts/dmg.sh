#!/bin/sh
# Builds the release app and packs it into an unsigned dmg with an Applications link.
# Plain hdiutil: Tauri's own dmg step scripts Finder to lay out the window, which needs a GUI session.
#   sh scripts/dmg.sh   →   src-tauri/target/release/bundle/dmg/decs_<version>_<arch>.dmg
set -eu
cd "$(dirname "$0")/.."
npx tauri build --bundles app
version=$(node -p "require('./src-tauri/tauri.conf.json').version")
arch=$(uname -m | sed 's/arm64/aarch64/')
app=src-tauri/target/release/bundle/macos/decs.app
out=src-tauri/target/release/bundle/dmg
stage=$(mktemp -d)
trap 'rm -rf "$stage"' EXIT
cp -R "$app" "$stage/"
ln -s /Applications "$stage/Applications"
mkdir -p "$out"
dmg="$out/decs_${version}_${arch}.dmg"
rm -f "$dmg"
hdiutil create -quiet -volname decs -srcfolder "$stage" -fs HFS+ -format UDZO -imagekey zlib-level=9 "$dmg"
echo "$dmg ($(du -h "$dmg" | cut -f1))"
