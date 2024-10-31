<script lang="ts" setup>
import { withBase } from 'vitepress';
import { PropType } from 'vue';
interface PageData {
    title: string
    titleTemplate?: string | boolean
    description: string
    relativePath: string
    filePath: string,
    headers: Header[]
    frontmatter: Record<string, any>
    params?: Record<string, any>
    isNotFound?: boolean
    lastUpdated?: number
}
defineProps({
    posts: {
        type: Array as PropType<PageData[]>,
        required: true
    }
})
</script>
