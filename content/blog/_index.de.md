---
title: "Der Blog"
slug: blog
seoTitle: "Der Blog des Col Roulé, Ferienwohnung in Valloire"
description: "Neuigkeiten zur Wohnung, Öffnung der Buchungen und unsere Tipps, um Valloire zu geniessen: die Neuigkeiten des Col Roulé."
ogImage: /images/niveau_principal.jpg
menu:
  main:
    weight: 4
# Posts are shown on this page only: no HTML page of their own, but an
# e-mail version (newsletter, layouts/blog/page.email.html), not in the sitemap.
cascade:
  - build:
      render: always
      list: always
    outputs: [email]
    sitemap:
      disable: true
    target:
      kind: page
# Deliberate choices of this translation: keep them when updating it from
# the French page (see "Translation notes" in README.md).
translationNotes:
  - "Swiss spelling: 'ss', never the sharp s (Strasse, gross, geniessen), readable in Germany and Austria too."
---
