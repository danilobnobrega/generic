# GENERIC

> We do things for people.

Personal site for a one-person web studio. The copy insists the site is plain and
effortless. The site is a WebGL experience where every page is its own authorial
world, connected only by the deadpan voice and a thin persistent layer.

## Run

```bash
npm install
npm run dev        # http://localhost:5180
npm run build      # typecheck + production build
npm run typecheck
```

Append `#debug` to the URL for lil-gui + stats.

## Architecture

Single canvas, single render loop, single `WebGLRenderer`. Everything spatial —
including text — renders in WebGL. The DOM layer holds only the persistent chrome
and screen-reader copy.

```
src/
  Experience/
    Experience.ts          orchestrator — owns every subsystem, wires resize + tick
    Renderer.ts            the one WebGLRenderer; decides what to draw each frame
    Router.ts              History API, intercepts <a> clicks, deep-linkable rooms
    core/
      Time.ts   Sizes.ts   the rAF loop and viewport state (typed EventEmitter)
      Resources.ts          per-room asset loader (GLTF/Draco/KTX2/audio), route-split
      Debug.ts              lil-gui + stats, only on #debug
    systems/
      Cursor.ts             custom pointer: lagging ring + dot + one-word label
      Transition.ts         freeze outgoing frame to a render target, tear it away
    World/
      World.ts              holds the one live Room, orchestrates the swap
      Room.ts               abstract: build -> enter -> update* -> dispose
      rooms/
        HeroRoom.ts          the blank sheet + the doors
        PlaceholderRoom.ts   honest WebGL stand-in for rooms not built yet
  config/rooms.ts          the route table: accent, cursor, copy, door position, loader
  shaders/                 .glsl imported via vite-plugin-glsl
  ui/
    Chrome.ts              wordmark, native <select> nav, domain, cookie banner
    Loader.ts              the deadpan generic loader shown between rooms
```

### Adding a real room

1. Write `src/Experience/World/rooms/ServicesRoom.ts` extending `Room`.
2. Point that route's `load` in `config/rooms.ts` at it (`() => import('...')`).
   It is now code-split — its shaders, geometry and assets only load on entry.

## Status

Phase 1: engine core, router, transition, hero, persistent chrome. The nine rooms
are `PlaceholderRoom` until built one at a time.

## Open

- Fonts: troika currently uses its default (Roboto, fetched from a CDN). Bundle a
  serif for the wordmark energy and a mono for labels.
- Post-processing (`EffectComposer`) and physics (Rapier) land in later phases.
