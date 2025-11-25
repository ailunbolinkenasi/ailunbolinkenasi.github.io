import type { SiteConfig } from "@/types";

export const siteConfig: SiteConfig = {
	// Used as both a meta property (src/components/BaseHead.astro L:31 + L:49) & the generated satori png (src/pages/og-image/[slug].png.ts)
	author: "iren",
	// Date.prototype.toLocaleDateString() parameters, found in src/utils/date.ts.
	date: {
		locale: "zh-CN",
		options: {
			year: "numeric",
			month: "long",
			day: "numeric",
		},
	},
	// Used as the default description meta property and webmanifest description
	description: "一个基于 Astro 构建的个人技术博客，分享编程经验和技术见解",
	// HTML lang property, found in src/layouts/Base.astro L:18 & astro.config.ts L:48
	lang: "zh-CN",
	// Meta property, found in src/components/BaseHead.astro L:42
	ogLocale: "zh_CN",
	// Used to construct the meta title property found in src/components/BaseHead.astro L:11, and webmanifest name found in astro.config.ts L:42
	title: "Moment Collector",
};

// Used to generate links in both the Header & Footer.
export const menuLinks: { path: string; title: string }[] = [
	{
		path: "/",
		title: "首页",
	},
	{
		path: "/about/",
		title: "关于",
	},
	{
		path: "/blog/",
		title: "博客",
	},
	{
		path: "/notes/",
		title: "笔记",
	},
	{
		path: "/links/",
		title: "友链",
	},
];