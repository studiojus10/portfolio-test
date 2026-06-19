# Portfolio Fix Checklist

## Priority 1: Restore Missing Asset Content

- [x] Install Git LFS locally.
- [x] Run `git lfs install`.
- [x] Run `git lfs pull`.
- [x] Confirm photo files are real images, not Git LFS pointer text.
- [x] Recheck a sample file with `file assets/images/colorado/twelve-views-of-pikes-peak/TYPOLOGY-01.jpg`.
- [x] Open `index.html` after LFS pull and confirm carousel photos display.
- [x] Open one gallery page and confirm gallery photos display.

## Priority 2: Fix Broken Local References

- [x] Add or remove missing composer image references:
  - [x] `assets/art/composers/barber.png`
  - [x] `assets/art/composers/dvorak.png`
  - [x] `assets/art/composers/ravel.jpg`
  - [x] `assets/art/composers/shostakovitch.png`
- [ ] Add or remove missing resume/CV download links:
  - [ ] `assets/resume.pdf`
  - [ ] `assets/cv.pdf`
- [ ] Add or remove missing video assets:
  - [ ] `assets/videos/auto-play/anamorphic_test.mp4`
  - [ ] `assets/videos/thumbnail-videos/proposal-thumbnail.mp4`
  - [ ] `assets/videos/thumbnail-videos/winter-scene-thumbnail.mp4`
  - [ ] `assets/videos/thumbnail-videos/collage-thumbnail.mp4`
  - [ ] `assets/videos/thumbnail-videos/portrait-thumbnail.mp4`
  - [ ] `assets/videos/thumbnail-videos/single-shot-thumbnail.mp4`
  - [ ] `assets/videos/thumbnail-videos/resurrection-thumbnail.mp4`
  - [ ] `assets/videos/thumbnail-videos/murder-he-wrote-thumbnail.mp4`
  - [ ] `assets/videos/thumbnail-videos/decadance-thumbnail.mp4`
- [ ] Fix or remove category background video references:
  - [ ] `website-animations/jus10photos-master/scroll-video-site/assets/cam.mp4`

## Priority 3: Verify Site Works From Local Files

- [ ] Open `index.html` directly in browser.
- [ ] Click through nav links from `index.html`.
- [ ] Confirm relative CSS loads: `assets/css/styles.css`.
- [ ] Confirm relative JS loads:
  - [ ] `assets/js/nav.js`
  - [ ] `assets/js/main.js`
- [ ] Confirm local image paths with spaces load after Git LFS pull.
- [ ] Confirm lightboxes work on gallery pages.
- [ ] Confirm the site also works from a local server.

## Priority 4: Clean Up File Organization

- [x] Decide whether this stays as hand-written static HTML or becomes generated/template-driven.
- [x] If static, move repeated gallery CSS into shared stylesheet: `assets/css/gallery.css`.
- [x] If static, move repeated lightbox JavaScript into shared JS: `assets/js/gallery-lightbox.js`.
- [x] If generated, create one gallery template and one data file for gallery metadata. Not applicable; static HTML kept for this cleanup pass.
- [x] Reduce duplicated Tailwind config across HTML pages: `assets/js/tailwind-config.js`.
- [x] Standardize asset naming to lowercase hyphenated paths.
- [x] Remove spaces from folder names when practical:
  - [x] `assets/images/colorado/twelve-views-of-pikes-peak`
  - [x] `assets/images/colorado/rock-ledge-ranch`
- [x] Update all HTML/JS references after any rename.

## Priority 5: Simplify Page Structure

- [x] Keep core pages:
  - [x] `index.html`
  - [x] `about.html`
  - [x] `contact.html`
  - [x] `photography.html`
  - [x] `art.html`
  - [x] `video.html`
- [x] Review whether individual gallery pages are needed for every series. Individual views remain, but separate HTML documents do not.
- [x] Consolidate duplicate gallery page layouts into `gallery.html`.
- [x] Centralize gallery metadata in `assets/js/gallery-data.js`. A JavaScript data file was used instead of fetched JSON so galleries still work when HTML files are opened directly.
- [x] Remove 13 obsolete gallery HTML pages after confirming navigation no longer points to them.
- [x] Consolidate five photography category pages into `photography-series.html` with shared data and behavior.
- [x] Consolidate two art collection pages into `art-gallery.html` with shared data and behavior.
- [x] Reduce the top-level HTML count from 26 to 9 without merging unrelated core pages.

## Priority 6: Content And UX Review

- [ ] Check every nav dropdown link.
- [ ] Check every footer link.
- [ ] Check every gallery title and caption.
- [ ] Add useful `alt` text for meaningful images.
- [ ] Keep decorative images with empty `alt=""`.
- [ ] Check mobile layout on gallery pages.
- [ ] Check desktop layout on gallery pages.
- [ ] Check dark mode behavior.

## Priority 7: Deployment Readiness

- [ ] Confirm Git LFS is supported by the deployment host.
- [ ] If deployment host does not support LFS, replace LFS pointers with actual optimized images before deploy.
- [ ] Optimize large images for web delivery.
- [ ] Add cache-friendly image sizes if needed.
- [ ] Test deployed site, not only local files.
- [ ] Confirm no broken image/video/document requests in browser dev tools.

## Notes From Initial Review

- There are 26 top-level HTML files.
- The page count is workable for a static portfolio, but the repeated gallery code makes maintenance fragile.
- All checked photo assets were Git LFS pointer text files, not actual image binaries.
- Main photo problem is asset checkout, not HTML image syntax.
- Several non-photo assets are referenced but absent from the repo.
- The simplified structure now uses 9 top-level HTML files; photography and art variants are selected with query parameters.
