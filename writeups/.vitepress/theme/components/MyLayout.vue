<template>
    <Layout>
        <template #doc-before>
        </template>
        <template #home-hero-before>
            <slot name="home-hero-before" />
            <div class="home">
                <Home :posts="posts" />
            </div>
        </template>
    </Layout>
</template>

<script setup>
import { computed } from 'vue';
import DefaultTheme from 'vitepress/theme';
import { useData } from 'vitepress';
import Home from './Home.vue';
const { Layout } = DefaultTheme;
const { theme, frontmatter } = useData();
const layout = computed(() => frontmatter.value.layout);
const posts = theme.value.annya.posts;

console.log(posts);
</script>

<style scoped>
.home {
    display: flex;
    margin: 0 auto;
    padding: 20px;
    max-width: 1100px;
}
</style>
