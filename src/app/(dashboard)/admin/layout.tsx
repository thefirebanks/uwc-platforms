export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="layout admin-shell">
      {children}
    </div>
  );
}
