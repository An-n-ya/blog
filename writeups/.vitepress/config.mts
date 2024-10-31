import { defineConfig } from 'vitepress'
import { Annya } from './theme/index.mts'
import { getPosts } from './theme/plugins/post_data'

const posts: Annya.Post[] = []



// https://vitepress.dev/reference/site-config
export default defineConfig({
    title: "Annya's Writeups",
    description: "Coding is fun",
    base: "/",
    vite: {
        plugins: [getPosts()]
    },
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
        ],

        lastUpdated: {
            text: "更新于"
        },
        lastUpdatedText: "更新于",


        annya: {
            posts
        }
    }
})
