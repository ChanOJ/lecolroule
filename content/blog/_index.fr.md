---
title: "Le Blog"
slug: blog
seoTitle: "Le blog du Col Roulé, location à Valloire"
description: "Les nouveautés de l'appartement, l'ouverture des réservations et nos conseils pour profiter de Valloire : les actualités du Col Roulé."
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
---
