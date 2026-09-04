"use client";

import dynamic from "next/dynamic";

const MoonScene = dynamic(
  () => import("./moon-scene").then((mod) => mod.MoonScene),
  { ssr: false },
);

export function MoonSceneLoader() {
  return <MoonScene />;
}
