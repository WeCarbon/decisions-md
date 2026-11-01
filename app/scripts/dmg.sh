#!/bin/sh
# Builds Noddit.app and packs it into a dmg — signed and notarised when this Mac can, unsigned otherwise.
#
#   sh scripts/dmg.sh                 sign if a "Developer ID Application" identity is in the keychain,
#                                     notarise with the keychain profile below, staple the ticket
#   sh scripts/dmg.sh --no-notarize   sign only
#   sh scripts/dmg.sh --unsigned      neither (ad-hoc signature, as for local testing)
#
# Environment:
#   APPLE_SIGNING_IDENTITY   which identity to sign with (default: the first Developer ID Application found)
#   NOTARY_PROFILE           notarytool keychain profile (default: noddit-notary), see SIGNING.md
#   APPLE_API_KEY_PATH, APPLE_API_KEY, APPLE_API_ISSUER
#                            an App Store Connect API key instead of the keychain profile
#
# Output: src-tauri/target/release/bundle/dmg/noddit_<version>_<arch>.dmg
set -eu
cd "$(dirname "$0")/.."

notarize=yes
sign=auto
for arg in "$@"; do
  case "$arg" in
    --no-notarize) notarize=no ;;
    --unsigned) sign=no; notarize=no ;;
    *) echo "unknown option: $arg" >&2; exit 2 ;;
  esac
done

identity=""
if [ "$sign" = auto ]; then
  identity=${APPLE_SIGNING_IDENTITY:-$(security find-identity -v -p codesigning 2>/dev/null | sed -n 's/.*"\(Developer ID Application: .*\)"/\1/p' | head -1)}
  [ -n "$identity" ] || { echo "No Developer ID Application identity in the keychain: building unsigned (see SIGNING.md)."; notarize=no; }
fi

# Tauri signs the app (hardened runtime, entitlements.plist) when it has an identity; notarisation
# happens once, on the dmg, below — so Tauri gets none of the notary credentials.
env -u APPLE_ID -u APPLE_PASSWORD -u APPLE_TEAM_ID -u APPLE_API_KEY -u APPLE_API_ISSUER -u APPLE_API_KEY_PATH \
  ${identity:+APPLE_SIGNING_IDENTITY="$identity"} npx tauri build --bundles app

version=$(node -p "require('./src-tauri/tauri.conf.json').version")
arch=$(uname -m | sed 's/arm64/aarch64/')
app=src-tauri/target/release/bundle/macos/Noddit.app
out=src-tauri/target/release/bundle/dmg
dmg="$out/noddit_${version}_${arch}.dmg"

if [ -n "$identity" ]; then
  codesign --verify --deep --strict "$app"
  codesign -dv "$app" 2>&1 | grep -q 'flags=.*runtime' || { echo "Noddit.app is not signed with the hardened runtime" >&2; exit 1; }
fi

stage=$(mktemp -d)
trap 'rm -rf "$stage"' EXIT
cp -R "$app" "$stage/"
ln -s /Applications "$stage/Applications"
mkdir -p "$out"
rm -f "$dmg"
hdiutil create -quiet -volname Noddit -srcfolder "$stage" -fs HFS+ -format UDZO -imagekey zlib-level=9 "$dmg"

if [ -n "$identity" ]; then
  codesign --sign "$identity" --timestamp "$dmg"
fi

if [ "$notarize" = yes ]; then
  if [ -n "${APPLE_API_KEY_PATH:-}" ]; then
    auth="--key $APPLE_API_KEY_PATH --key-id ${APPLE_API_KEY:?APPLE_API_KEY} --issuer ${APPLE_API_ISSUER:?APPLE_API_ISSUER}"
  else
    auth="--keychain-profile ${NOTARY_PROFILE:-noddit-notary}"
  fi
  echo "Submitting to Apple's notary service (usually a few minutes)…"
  # shellcheck disable=SC2086
  result=$(xcrun notarytool submit "$dmg" $auth --wait --output-format json)
  status=$(printf '%s' "$result" | node -e 'const r=JSON.parse(require("fs").readFileSync(0));console.log(r.status)')
  if [ "$status" != Accepted ]; then
    id=$(printf '%s' "$result" | node -e 'const r=JSON.parse(require("fs").readFileSync(0));console.log(r.id)')
    echo "Notarisation: $status. Apple's log:" >&2
    # shellcheck disable=SC2086
    xcrun notarytool log "$id" $auth >&2 || true
    exit 1
  fi
  xcrun stapler staple "$dmg"
  xcrun stapler validate "$dmg"
  spctl -a -t open --context context:primary-signature -vv "$dmg"
fi

state=unsigned
[ -n "$identity" ] && state=signed
[ "$notarize" = yes ] && state="signed, notarised"
echo "$dmg ($(du -h "$dmg" | cut -f1), $state)"
