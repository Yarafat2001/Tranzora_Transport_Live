import LandingPage from "@/components/LandingPage";
import { getSessionUser } from "@/lib/auth";

export default async function Home() {
  const user = await getSessionUser().catch(() => null);

  return <LandingPage signedIn={Boolean(user)} />;
}
