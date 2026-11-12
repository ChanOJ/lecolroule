---
title: "The Blog"
slug: blog
seoTitle: "Le Col Roulé blog, holiday rental in Valloire"
description: "What's new in the apartment, booking openings and our tips to make the most of Valloire: the latest news from Le Col Roulé."
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
