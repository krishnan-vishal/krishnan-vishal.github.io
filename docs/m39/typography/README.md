# M39 typography and ASK GPIR review evidence

Representative page: `/cross-border-payments/`.

| Viewport | Published baseline | PR branch result |
|---|---|---|
| Desktop, 1440 × 1000 | `cross-border-before-desktop.jpg` | `cross-border-after-desktop.jpg` |
| Mobile, 390 × 844 | `cross-border-before-mobile.jpg` | `cross-border-after-mobile.jpg` |

The baseline images show the production site before PR #575. The result images
show the same route and viewport on the PR branch preview. The comparison is
limited to presentation and contextual ASK GPIR navigation; publication text,
identity, canonical route and access classification are unchanged.

Responsive acceptance also records `scrollWidth <= clientWidth` at both
viewports and verifies the topic-context `ASK GPIR` link in the rendered page.
