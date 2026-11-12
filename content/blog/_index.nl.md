---
title: "De Blog"
slug: blog
seoTitle: "De blog van Le Col Roulé, vakantieverhuur in Valloire"
description: "Nieuwtjes over het appartement, de opening van de reserveringen en onze tips om van Valloire te genieten: het laatste nieuws van Le Col Roulé."
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
