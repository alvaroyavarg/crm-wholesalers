export function Card({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-(--radius-card) bg-white p-5 shadow-card ${className}`}
    >
      {children}
    </div>
  );
}
