import type { MetadataRoute } from "next";

const SITE_URL = "https://stack-city-eight.vercel.app";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: SITE_URL, changeFrequency: "weekly", priority: 1 },
    { url: `${SITE_URL}/legal`, changeFrequency: "yearly", priority: 0.4 },
  ];
}
