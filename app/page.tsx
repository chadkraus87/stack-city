import type { Metadata } from "next";
import { StackCityGame } from "./game/StackCityGame";

export const metadata: Metadata = {
  title: "Stack City — Infrastructure Strategy Game",
  description:
    "Build the infrastructure. Survive the traffic. A hands-on systems architecture strategy game.",
};

export default function Home() {
  return <StackCityGame />;
}

