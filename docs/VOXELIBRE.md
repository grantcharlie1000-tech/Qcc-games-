# VoxeLibre on QCC Games

QCC includes the complete upstream **VoxeLibre 0.92.4** game pack running in a
locally bundled Luanti WebAssembly engine. The integration provides singleplayer
Survival and Creative worlds, the native game menus and inventory, world storage,
ZIP backups, QCC Study Mode and an explicit offline download.

The native engine, workers, game files and fonts are served from the same site.
There is no external game iframe, multiplayer proxy or account requirement.
The other thirteen arcade games keep their existing modules and save formats.

## Start a world

1. Open the **VoxeLibre** card and choose **Play VoxeLibre**.
2. Wait for the engine and game files to download and install. The first download
   is about 100 MB, and preparing a first world can take several minutes.
3. Create a world in the native menu. Choose Survival or Creative and whether
   damage is enabled, then enter the world.

The launcher checks secure context, cross-origin isolation, shared memory,
OffscreenCanvas, WebAssembly JSPI and WebGL 2 before requesting the engine.
Use a current desktop Chrome or Edge for the full game. The checks report an
unsupported browser without starting the large download. Touch controls come
from the native engine when supported; desktop gameplay remains the primary
verified interaction path.

| Action | Control |
| --- | --- |
| Move | W, A, S, D |
| Look | Mouse |
| Jump | Space |
| Dig / attack | Left mouse button |
| Place / use | Right mouse button |
| Inventory and crafting | I |
| Select hotbar slot | Number keys |
| Open selected study chapter | Escape or QCC's Study button |
| Resume after Study | Games link, then native Continue |
| Save and close the game | Back to library |

Native key bindings can be changed in the game's settings.

## World saves and backups

Worlds use the native browser filesystem, backed by origin-private storage when
available. The launcher's persistence indicator comes from the mounted native
filesystem, not merely a successful storage API probe. When persistence is
unavailable, **Play temporarily** requires a second explicit action and the
launcher explains that the world will not survive closing the game.

**Back to library** and **Restart** wait for native shutdown before removing the
game frame. Restart returns to the launcher and keeps saved worlds. The shell
matches each exit acknowledgement to its quit request; unrelated frame messages
or overlapping navigation cannot remove a still-saving game. Native save errors
remain visible even when the engine reports exit code zero.

Choose **World backups** before starting native play to download a ZIP or import
an existing backup. Imports use a checked, random new world directory. They do
not target an existing world. The importer checks the archive's paths, entry
types, sizes and metadata before calling the native installer. Native exports
may have a bounded all-zero block padding tail; that format is accepted.

Keep exported backups when moving devices or before clearing site data. Browser
storage belongs to the same origin, browser profile and device; QCC does not
provide cloud synchronization. Use the in-site Back control for an orderly save
and quit. Closing a browser process cannot await that lifecycle handshake.

## Study and sound

Escape or the shared Study control retains the same iframe and asks native play
to pause through focus loss. The selected study chapter uses the existing
twenty-topic reader. Returning restores the frame and leaves the native pause
menu open; Continue is an explicit action. The Study status distinguishes native
world storage from the compact arcade progress snapshot.

Sound starts muted with the rest of QCC. Native audio contexts follow the shared
sound setting and remain suspended during Study. Reduced motion disables native
view bobbing when the world starts.

## Offline and hosting

The initial library visit does not fetch native engine files or game packs.
**Make all games available offline** downloads the playable assets, including
VoxeLibre. Corresponding-source archives are separate downloads and are excluded
from the offline play manifest.

The static output supports both an origin root and a repository subpath.
Netlify receives the isolation headers from `netlify.toml` / `public/_headers`.
For a host without configurable headers, the service worker adds them to
controlled responses; the launcher offers a one-time reload. A blocked setup
operation shows a recovery action after twelve seconds.

The service worker preserves each navigation's document path. A cached request
for the nested native launcher never falls back to the arcade's root HTML.
Updates retain the existing waiting-worker lifecycle so an older open game is
not mixed with the next release. Browser offline storage still requires a
successful download and retention by the browser.

## Build and source

Use Node 22 and Python 3:

```sh
npm ci
npm run prepare:voxelibre
npm run dev
```

`npm run build` also runs preparation. It restores the already compiled engine
from checksum-verified repository parts, builds the game pack from the pinned
official release and assembles the corresponding-source download. It does not
compile C++ during ordinary Netlify or GitHub Actions builds.

The game ZIP is ContentDB release 39534 at
<https://cdn.content.luanti.org/uploads/3e11bd7181.zip>, SHA-256
`6215d4da27900874959ff586fb266091be3d4161b9d4f5d27ce0d0cdc49f1af2`.
Its deterministic runtime pack is 78,261,119 bytes, SHA-256
`21d3f4010471d0c3bb131c51b62122fed048e9d8abae2cef3d2e476c249a2d5d`.
The game retains the engine ID `mineclone2`.

The native archive manifest records each repository part, the joined archive,
each deployed file and the pinned build inputs. Extraction validates the entire
archive before replacing deployed files and preserves the separate game pack.
The source recipe verifies upstream archives and exact patches, includes the
required Emscripten runtime and port sources, and checks its reconstructed tree
against the compiled sources. See:

- [Native build recipe](../vendor/voxelibre/build/README.md)
- [Runtime manifest](../vendor/voxelibre/runtime-manifest.json)
- [Public source downloads and component notices](../public/voxelibre/SOURCES.md)

## Verification record

The recovered integration passed 318 unit tests and strict TypeScript checking.
The real 880,640-byte QCC Survival export passes the ZIP importer, including its
native block padding and browser metadata decompression.

Ten controlled-browser launcher checks cover preparation, native exit ordering,
script-download failure, save diagnostics, ZIP abort recovery, the real backup
format, temporary play, tab locking, Study/audio and the 320 px layout. Four
additional Chromium/WebKit cases verify that ordinary page errors and unhandled
rejections cannot skip native saving. An independent review verified both that
correction and the rebuilt engine's main-thread/worker abort callback support.

The full site browser suite, actual rebuilt-native gameplay, world import and
save/reopen checks, production offline checks and deployment verification are
recorded below as they complete. Controlled native stubs do not establish actual
engine compatibility or native filesystem persistence.
