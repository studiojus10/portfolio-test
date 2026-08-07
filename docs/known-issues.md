# Known issues

Open defects that are understood but deliberately not fixed yet, with the
evidence behind each so the next person does not have to re-derive it. Both
entries below surfaced while chasing the Firefox "shutter" bug on 2026-08-07
(see the last section); neither turned out to be its cause.

---

## 1. Four videos carry a non-square pixel aspect ratio

Four H.264 files are tagged `sample_aspect_ratio=4:3`, which stretches their
3840x2160 coded frame to a **64:27 (2.37:1)** display ratio. Their posters — and
every layout that sizes them — assume 16:9.

```
$ ffprobe -v error -select_streams v:0 \
    -show_entries stream=width,height,sample_aspect_ratio,display_aspect_ratio \
    -of default=nw=1 <file>
```

| file | coded | SAR | display ratio | poster ratio |
| --- | --- | --- | --- | --- |
| `videos/thumbnail-videos/winter-scene-thumbnail.mp4` | 3840x2160 | 4:3 | 2.37 | 1.78 |
| `videos/thumbnail-videos/proposal-thumbnail.mp4` | 3840x2160 | 4:3 | 2.37 | 1.78 |
| `videos/auto-play/anamorphic_test.mp4` | 3840x2160 | 4:3 | 2.37 | — |
| `videos/30mb-videos/winter-scene(30mb).mp4` | 3840x2160 | 4:3 | 2.37 | — |

Every other mp4 in the project (26 of 30) is square-pixel and unaffected.

**Why it is visible in Firefox but not Chrome.** Firefox honours the container's
SAR; Chrome, in these elements, effectively does not. So the same file renders
2.37:1 in one engine and 1.78:1 in the other.

Where that shows up:

- `winter-scene-thumbnail.mp4` — the home cylinder (`src/pages/index.astro`) and
  the `/video` grid. Both are `object-fit: cover` in a fixed box, so the visible
  result is a different crop per browser, not a different layout.
- `proposal-thumbnail.mp4` — the `/video` grid only.
- `anamorphic_test.mp4` — the `/video` hero (`src/pages/video/index.astro:39`),
  styled `width:100%; height:auto`. This one **changes page layout**: the hero's
  height is driven by the intrinsic ratio, so the block is materially shorter in
  Firefox than in Chrome.
- `winter-scene(30mb).mp4` — not referenced anywhere in `src/`. Dead file.

**Check intent before "fixing" `anamorphic_test.mp4`.** The name says anamorphic,
and an anamorphic source legitimately carries a non-square SAR. Its 4:3 tag may
be correct and deliberate. The other three look like an encoder artifact: their
posters were generated from the coded frame at 16:9 and read correctly at that
ratio.

**The fix, if the coded frame is already correct** — retag losslessly, no
re-encode, no quality loss:

```sh
ffmpeg -i in.mp4 -c copy -bsf:v h264_metadata=sample_aspect_ratio=1/1 out.mp4
```

If instead the 2.37:1 presentation is the intended one, bake it in by scaling to
5120x2160 with a 1:1 SAR and regenerate the poster to match. Either way both the
video and its poster must end up on the same ratio.

**This is a media-volume change, not a repo change.** `/public/assets/` is
gitignored (`.gitignore:63`) and mounted as a volume at runtime, so no commit or
redeploy fixes it — the files on the volume have to be replaced in place.

Verify with the `ffprobe` command above; `sample_aspect_ratio` should read `1:1`
or `N/A`.

---

## 2. `will-change` on the home cylinder cards exceeds Firefox's budget

`.cyl-card` in `src/pages/index.astro` declares `will-change: transform, filter`.
There are **40 of them** — 20 ring cards plus 20 mirrored floor-reflection clones
built in `src/scripts/home-cylinder.js`.

Firefox caps the total area of `will-change` elements at
`layout.css.will-change.budget` x the viewport area (default multiplier **3**).
Reproducing `measure()`'s sizing maths against that cap, the ring is over budget
at every common viewport size:

| viewport | card w x h | will-change area | budget (3x vp) | usage |
| --- | --- | --- | --- | --- |
| 1366x768 | 231 x 462 | 4.3 Mpx | 3.1 Mpx | **136%** |
| 1440x900 | 243 x 487 | 4.7 Mpx | 3.9 Mpx | **122%** |
| 1920x1080 | 324 x 649 | 8.4 Mpx | 6.2 Mpx | **135%** |
| 2560x1440 | 433 x 865 | 15.0 Mpx | 11.1 Mpx | **135%** |
| 3840x2160 | 649 x 1298 | 33.7 Mpx | 24.9 Mpx | **135%** |

Over budget, Firefox ignores the hint for whichever occurrences tipped it over —
so an arbitrary subset of cards silently gets different treatment from its
neighbours. That is the opposite of what the declaration is asking for.

**The hint buys nothing here.** `will-change` helps an animation that has not
started yet. These cards have their `transform` (and `filter`) rewritten by JS
on every frame from page load onward, so both engines already keep them
layerized on their own.

**Removing it is safe.** Stacking context and containing block are unaffected:
the inline `transform` that `place()` writes establishes both regardless.

Measured, not assumed — captured at 13 identical rotations in both engines
(drive rotation deterministically by emulating `prefers-reduced-motion`, which
stops `advance()`, then clicking `#carousel-next`, which steps exactly
`360/N` degrees per click):

- Firefox: **pixel-identical** at 12 of 13 rotations. The 13th differed only in
  the typewriter-name strip, which a same-code control run showed is animation
  timing noise.
- Chromium: differs only in edge and text antialiasing — max per-pixel delta
  116, zero pixels above 128. Cards rasterize at final resolution instead of
  from a cached pre-transform layer, which is marginally sharper.

Not done yet only because it is unrelated to the bug it was found under, and
that change was kept minimal. Note it was **tested and ruled out** as the cause
of the shutter bug below — removing it did not fix that.

---

## Context: the Firefox "shutter" bug (fixed 2026-08-07)

Recorded because it is the kind of fix that looks like a pointless detour and
invites being "simplified" back.

Cards in the home cylinder were filled near-black from the top and bottom
inward, converging on a thin gap in the middle, as they swung past certain
rotation angles — like a shutter closing. Firefox only, and deterministic per
angle: freeze the ring at a bad angle and the artifact holds still.

The cause was `.cyl-card::before`, which drew the card's inner frame line as
`border: 1px solid var(--room-frame-line)`. Firefox mis-rasterizes a hairline
border on a 3D-projected element; at some angles the top and bottom border edges
blow out and expand inward until they nearly meet, flooding the card with
`--room-frame-line` (`#1c1b1b` in the light theme).

The fix draws the identical line as `box-shadow: inset 0 0 0 1px` instead. The
geometry is the same — the pseudo-element's box is the `inset: 5px` rect either
way, and an inset shadow paints inside that same border box — but the
rasterization path does not blow out. **Do not revert this to a `border`.**

Bisected by elimination with a temporary `?cyldebug=` harness. The decisive
result: stripping the `img`/`video` from every card still produced a black card,
which ruled out the media entirely and left the pseudo-element as the only black
thing on a card. Disabling the per-card `brightness()` filter, `#cyl-floor-tint`,
`#hero-name-overlay`, `#hero-person`, and the whole floor ring each changed
nothing, ruling out every composited layer above and below the ring.
