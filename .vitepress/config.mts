import { defineConfig } from 'vitepress'

// https://vitepress.dev/reference/site-config
export default defineConfig({
  title: "Jake Searle's Garden",
  description: "A VitePress Site",
  themeConfig: {
    // https://vitepress.dev/reference/default-theme-config
    nav: [
      { text: 'Home', link: '/' },
      { text: 'Rivals 2', link: '/rivals' }
    ],

    socialLinks: [
      { icon: 'github', link: 'https://https://github.com/jakesearle' }
    ]
  }
})
