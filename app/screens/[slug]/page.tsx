import { notFound } from "next/navigation";
import AppScreen from "@/components/AppScreen";
import { getScreen, screens } from "@/lib/screens";

export function generateStaticParams() {
  return screens.map((screen) => ({ slug: screen.slug }));
}

export default async function ScreenPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const screen = getScreen(slug);
  if (!screen) notFound();
  return <AppScreen screen={screen} />;
}
