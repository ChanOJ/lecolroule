---
title: "Il Blog"
slug: blog
seoTitle: "Il blog del Col Roulé, casa vacanze a Valloire"
description: "Le novità dell'appartamento, l'apertura delle prenotazioni e i nostri consigli per godersi Valloire: le notizie del Col Roulé."
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
