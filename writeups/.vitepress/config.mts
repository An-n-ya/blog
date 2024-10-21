import { defineConfig } from 'vitepress'

// https://vitepress.dev/reference/site-config
export default defineConfig({
  title: "Annya's Writeups",
  description: "Coding is fun",
  base: "/",
  themeConfig: {
    // https://vitepress.dev/reference/default-theme-config
    nav: [
      { text: 'Home', link: '/' },
      { text: '源码阅读', link: '/bear/bear' }
    ],

    sidebar: [
      {
        text: '源码阅读',
        items: [
          { text: 'Bear 工作原理', link: '/bear/bear' },
        ]
      }
    ],

    socialLinks: [
      { icon: 'github', link: 'https://github.com/An-n-ya' }
    ]
  }
})
