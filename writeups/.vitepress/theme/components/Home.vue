<template>
    <ul class="post-wrapper">
        <template v-for="post in posts">
            <li v-if="post.public" :key="post.route">
                <a class="blog-item" :href="post.route">
                    <p class="title">
                        {{ post.title }}
                    </p>
                    <p class="intro">
                        {{ post.intro }}
                    </p>
                    <p class="date">
                        {{ post.date }}
                    </p>
                </a>
            </li>
        </template>
    </ul>
</template>

<script lang="ts" setup>
import { Annya } from "../index.mts";
const props = defineProps<{
    posts: Annya.Post[]
}>();

</script>

<style scoped>
.post-wrapper {
    list-style: none;
    width: 100%;
}

.post-wrapper li {
    list-style: none;
    overflow-wrap: break-word;
}

.blog-item {
    position: relative;
    margin: 0 auto 20px;
    padding: 10px 20px;
    overflow: hidden;
    border-radius: .25rem;
    background-color: var(--vp-c-bg-elv);
    box-shadow: var(--vp-shadow-1);
    width: 100%;
    display: flex;
    flex-direction: column;
}

.blog-item:hover {
    box-shadow: var(--vp-shadow-2);
}

.title {
    color: var(--vp-c-text-1);
    font-size: 18px;
    font-weight: 600;
    margin-bottom: 10px;
}

.intro {
    color: var(--vp-c-text-2);
    overflow: hidden;
    font-size: 14px;
    margin-bottom: 10px;
}

.date {
    color: var(--vp-c-text-1);
    font-size: 14px;
}
</style>
