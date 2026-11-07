import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Stack City — Infrastructure Strategy Game",
    short_name: "Stack City",
    description: "Build a digital city, route live traffic, and survive production incidents.",
    start_url: "/",
    display: "standalone",
    background_color: "#060b0f",
    theme_color: "#b8f752",
    categories: ["games", "education", "strategy"],
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
    ],
  };
}
