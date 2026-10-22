import { STATUS, isOverdue } from '../format';

export default function StatusBadge({ invoice }) {
  const s = STATUS[invoice.status];
  return (
    <span className="badges">
      <span className={`badge ${s.tone}`}>{s.label}</span>
      {isOverdue(invoice) && <span className="badge bad">Overdue</span>}
    </span>
  );
}
