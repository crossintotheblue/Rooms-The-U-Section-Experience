import { createFileRoute } from "@tanstack/react-router";
import DoorsGame from "@/components/DoorsGame";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "U Section Experience" },
      { name: "description", content: "Endless Doors is a 3D horror game where players navigate procedurally generated rooms." },
      { property: "og:title", content: "U Section Experience" },
      { property: "og:description", content: "Endless Doors is a 3D horror game where players navigate procedurally generated rooms." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

function Index() {
  return <DoorsGame />;
}
