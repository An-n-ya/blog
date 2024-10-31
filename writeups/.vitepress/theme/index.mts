import { useRoute, type Theme } from "vitepress";
import DefaultTheme from "vitepress/theme";
import MyLayout from "./components/MyLayout.vue";
import imageViewer from "vitepress-plugin-image-viewer";
import vImageViewer from "vitepress-plugin-image-viewer/lib/vImageViewer.vue";

export namespace Annya {
    export interface Post {
        title: string
        date: string
        intro: string
        route: string
        public?: boolean
        tags?: string[]
    }

    export interface Config {
        posts: Post[]
    }
}


export default {
    extends: DefaultTheme,
    Layout: MyLayout,
    enhanceApp(ctx) {
        ctx.app.component('vImageViewer', vImageViewer);
    },
    setup() {
        const route = useRoute();
        imageViewer(route);
    }
} satisfies Theme


