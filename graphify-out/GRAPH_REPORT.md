# Graph Report - .  (2026-06-19)

## Corpus Check
- Large corpus: 199 files · ~18,146,852 words. Semantic extraction will be expensive (many Claude tokens). Consider running on a subfolder.

## Summary
- 73 nodes · 83 edges · 15 communities (12 shown, 3 thin omitted)
- Extraction: 82% EXTRACTED · 18% INFERRED · 0% AMBIGUOUS · INFERRED: 15 edges (avg confidence: 0.78)
- Token cost: 167,892 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Page UI & Interaction Components|Page UI & Interaction Components]]
- [[_COMMUNITY_Gallery Data & Controllers|Gallery Data & Controllers]]
- [[_COMMUNITY_Landing & Brand Identity|Landing & Brand Identity]]
- [[_COMMUNITY_Navigation Menu Logic|Navigation Menu Logic]]
- [[_COMMUNITY_Claude Hooks Config|Claude Hooks Config]]
- [[_COMMUNITY_Design Tokens & Assets|Design Tokens & Assets]]
- [[_COMMUNITY_Graphify Workflow|Graphify Workflow]]
- [[_COMMUNITY_Art Gallery URL Helper|Art Gallery URL Helper]]

## God Nodes (most connected - your core abstractions)
1. `Home / Landing Page` - 9 edges
2. `Site Navigation Builder` - 9 edges
3. `StudioJus10Galleries (gallery metadata)` - 7 edges
4. `lnk()` - 5 edges
5. `Photography Series Detail Page` - 5 edges
6. `init()` - 4 edges
7. `About Page` - 4 edges
8. `Photography Index Page` - 4 edges
9. `Art Gallery Detail Page` - 4 edges
10. `Photography Gallery Detail Page` - 4 edges

## Surprising Connections (you probably didn't know these)
- `StudioJus10Gallery Lightbox Module` --semantically_similar_to--> `Art Gallery Lightbox`  [INFERRED] [semantically similar]
  assets/js/gallery-lightbox.js → art-gallery.html
- `Home / Landing Page` --shares_data_with--> `co-theme localStorage Key`  [INFERRED]
  index.html → assets/js/nav.js
- `Contact Page` --references--> `Site Navigation Builder`  [EXTRACTED]
  contact.html → assets/js/nav.js
- `Home / Landing Page` --references--> `Infinite Carousel Controller`  [EXTRACTED]
  index.html → assets/js/main.js
- `Home / Landing Page` --references--> `Site Navigation Builder`  [EXTRACTED]
  index.html → assets/js/nav.js

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Shared Nav + Theme + Tailwind Page Chrome** — js_nav_navigation, js_tailwindconfig_config, concept_co_theme_localstorage, concept_studiojus10_brand [INFERRED 0.85]
- **Scroll-Driven Hero Animation Pattern** — about_parallax_hero, photography_modern_hero, video_scroll_hero, artgallery_tilt_gallery [INFERRED 0.75]
- **Gallery-to-Lightbox Browsing Flow** — gallery_gallery_page, js_gallerylightbox_module, artgallery_lightbox, photographyseries_accordion [INFERRED 0.75]
- **Photography series-to-gallery data flow** — js_photography_series_data_series, js_gallery_data_galleries, js_photography_series_page_controller [EXTRACTED 0.85]
- **Data-driven static gallery pattern** — js_gallery_data_galleries, js_art_gallery_data_galleries, fixes_data_driven_galleries [INFERRED 0.75]

## Communities (15 total, 3 thin omitted)

### Community 0 - "Page UI & Interaction Components"
Cohesion: 0.16
Nodes (18): Art Index Page, Art Gallery Detail Page, Art Gallery Lightbox, Scroll-Tilt 3D Gallery, co-theme localStorage Key, Photography Gallery Detail Page, StudioJus10Gallery Lightbox Module, Site Navigation Builder (+10 more)

### Community 1 - "Gallery Data & Controllers"
Cohesion: 0.19
Nodes (13): JS data file over fetched JSON for galleries, Static HTML consolidation via query params, StudioJus10ArtGalleries (art metadata), art-gallery-page controller, StudioJus10Galleries (gallery metadata), galleryUrl(), sequence(), init() (+5 more)

### Community 2 - "Landing & Brand Identity"
Cohesion: 0.20
Nodes (11): About Page, Justin Hughes, About Parallax Hero, STUDIO JUS10 Brand / Footer, Contact Page, Featured Gallery Carousel, Home / Landing Page, The Human Narrative (+3 more)

### Community 3 - "Navigation Menu Logic"
Cohesion: 0.31
Nodes (7): desktopLink(), dropItem(), lnk(), mobileSubItem(), mobileTopLink(), toggleTheme(), updateThemeUI()

### Community 6 - "Design Tokens & Assets"
Cohesion: 0.67
Nodes (3): STUDIO JUS10 editorial index page, Tailwind design tokens (colors/fonts/spacing), Git LFS asset restoration

## Knowledge Gaps
- **11 isolated node(s):** `PreToolUse`, `Justin Hughes`, `About Parallax Hero`, `Photography Scroll-Expand Hero`, `Tailwind Design Tokens Config` (+6 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **3 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Site Navigation Builder` connect `Page UI & Interaction Components` to `Landing & Brand Identity`?**
  _High betweenness centrality (0.078) - this node is a cross-community bridge._
- **Why does `Home / Landing Page` connect `Landing & Brand Identity` to `Page UI & Interaction Components`?**
  _High betweenness centrality (0.057) - this node is a cross-community bridge._
- **Are the 2 inferred relationships involving `StudioJus10Galleries (gallery metadata)` (e.g. with `StudioJus10ArtGalleries (art metadata)` and `galleryUrl()`) actually correct?**
  _`StudioJus10Galleries (gallery metadata)` has 2 INFERRED edges - model-reasoned connections that need verification._
- **What connects `PreToolUse`, `The Human Narrative`, `Justin Hughes` to the rest of the system?**
  _14 weakly-connected nodes found - possible documentation gaps or missing edges._