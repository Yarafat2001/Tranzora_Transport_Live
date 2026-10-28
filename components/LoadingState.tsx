export default function LoadingState({
  label,
  description,
}: {
  label: string;
  description?: string;
}) {
  return (
    <div className="loading-state" role="status" aria-live="polite">
      <span className="loading-spinner" aria-hidden="true" />
      <div>
        <strong>{label}</strong>
        {description && <p>{description}</p>}
      </div>
    </div>
  );
}
