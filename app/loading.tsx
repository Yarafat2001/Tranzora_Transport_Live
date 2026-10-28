import LoadingState from "@/components/LoadingState";

export default function Loading() {
  return (
    <main className="route-loading">
      <LoadingState
        label="Loading Tranzora"
        description="Preparing your page. Please wait a moment."
      />
    </main>
  );
}
