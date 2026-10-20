// Shown while an admin page loads: the page's shape rather than a lone
// spinner, so the real content replaces it without the layout jumping.
export default function PageSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="min-h-screen bg-black text-white" role="status" aria-label="Loading">
      <div className="page-skeleton-bar">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center gap-4">
          <span className="skel page-skeleton-icon" />
          <span className="skel page-skeleton-title" />
        </div>
      </div>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <span className="skel page-skeleton-heading" />
        {Array.from({ length: rows }, (_, i) => (
          <span key={i} className="skel page-skeleton-row" />
        ))}
      </div>
    </div>
  );
}
