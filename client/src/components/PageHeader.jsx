export default function PageHeader({ title, children, actions }) {
  return (
    <div className="page-header">
      <div>
        <h1>{title}</h1>
        {children && <p className="lede">{children}</p>}
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </div>
  );
}
