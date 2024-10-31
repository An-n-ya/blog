import { PluginOption } from "vite";
import { SiteData, SiteConfig } from "vitepress"
import { Annya } from "../index.mts";
import path from 'node:path';
import fs from 'node:fs';
import matter from "gray-matter";
import { spawn } from "node:child_process";

export function getPosts() {
    return {
        name: "@annya/vitepress-plugin-get-posts",
        async config(config: any, env) {
            //console.log("config data: ", config);
            const vitepress_config: SiteConfig = config.vitepress;
            const pages: string[] = vitepress_config.pages;
            let posts: Annya.Post[] = [];

            for (const page of pages) {
                const filepath = path.resolve(vitepress_config.srcDir, page);
                const route = page.replace(/\.md$/, '');
                console.log(filepath, route);
                posts.push(await fillInMetaData(filepath, route));
            }
            const annya_config: Annya.Config = config.vitepress.site.themeConfig.annya;
            annya_config.posts = posts;
        },
    } as PluginOption
}

async function fillInMetaData(filepath: string, route: string): Promise<Annya.Post> {
    const filecontent: string = await fs.promises.readFile(filepath, 'utf-8');
    const {
        data: frontmatter,
        excerpt,
        content
    } = matter(filecontent, { excerpt_separator: "<!-- intro -->" });
    let date = await get_date(filepath);
    let post_data: Annya.Post = {
        route,
        title: get_title(content),
        intro: get_intro(excerpt),
        date: format_date(date),
        public: frontmatter.public || false
    };
    console.log(post_data);
    return post_data;
}

function get_intro(excerpt: string | undefined): string {
    if (!excerpt) {
        return "";
    }
    return excerpt.replace(/(#+).+/, '').trim();
}

function get_title(content: string): string {
    const match = content.match(/(#+)\s+(.+)/m);
    return match?.[2] || ""
}
function get_date(filepath: string): Promise<Date | undefined> {
    return new Promise((resolve) => {
        const cwd = path.dirname(filepath);

        try {
            const filename = path.basename(filepath);
            const child = spawn('git', ['log', '-1', '--pretty="%ai"', filename], { cwd });
            let output = "";
            child.stdout.on("data", d => (output += String(d)));
            child.on("close", async () => {
                let date: Date | undefined;
                if (output.trim()) {
                    date = new Date(output)
                }
                resolve(date);
            })
            child.on("error", async () => {
                resolve(undefined);
            })
        } catch {
            resolve(undefined);
        }
    });
}

function format_date(date: Date | undefined): string {
    if (!date) {
        return ""
    }
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0"); // 月份从 0 开始计数
    const day = String(date.getDate()).padStart(2, "0");
    const hours = String(date.getHours()).padStart(2, "0");
    const minutes = String(date.getMinutes()).padStart(2, "0");
    const seconds = String(date.getSeconds()).padStart(2, "0");

    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}
