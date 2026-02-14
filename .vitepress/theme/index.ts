// https://vitepress.dev/guide/custom-theme
import { h } from 'vue'
import type { Theme } from 'vitepress'
import DefaultTheme from 'vitepress/theme'
import './style.css'
import CrochetWidget from '../../components/CrochetWidget.vue'
import SpineWidget from '../../components/SpineWidget.vue'
import DualSpineWidget from '../../components/DualSpineWidget.vue'

export default {
  extends: DefaultTheme,
  Layout: () => {
    return h(DefaultTheme.Layout, null, {
      // https://vitepress.dev/guide/extending-default-theme#layout-slots
    })
  },
  enhanceApp({ app, router, siteData }) {
    app.component('CrochetWidget', CrochetWidget)
    app.component('SpineWidget', SpineWidget)
    app.component('DualSpineWidget', DualSpineWidget)
  }
} satisfies Theme
