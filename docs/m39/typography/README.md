# M39 typography and ASK GPIR review evidence

Representative page: `/cross-border-payments/`.

| Viewport | Published baseline | PR branch result |
|---|---|---|
| Desktop, 1440 × 1000 | `cross-border-before-desktop.jpg` | `cross-border-after-desktop.jpg` |
| Mobile, 390 × 844 | `cross-border-before-mobile.jpg` | `cross-border-after-mobile.jpg` |

The baseline images show the production site before PR #575. The result images
show the same route and viewport on the PR branch preview at `f146ade`. The comparison is
limited to presentation and contextual ASK GPIR navigation; publication text,
identity, canonical route and access classification are unchanged.

Responsive acceptance records `scrollWidth == clientWidth` at both viewports.
The rendered topic-context link reads `ASK GPIR about this topic`; the mobile
topic context uses a column layout and the publication H1 computes to 32px.
