import { Link } from 'react-router-dom';
import { ROUTE, STATUS, WITH_VENDOR, money, balanceOf } from '../format';

// "Needs fixing" holds everything that is back with the vendor: failed checks, returned by finance, rejected by a manager.
const inStage = (i, status) => (status === 'verification_failed' ? WITH_VENDOR.includes(i.status) : i.status === status);

// The payment route: every invoice in the system, grouped by where it is in the flow.
export default function Route({ invoices }) {
  const stages = ROUTE.map((status) => {
    const list = invoices.filter((i) => inStage(i, status));
    const amount = list.reduce((s, i) => s + (i.status === 'paid' || WITH_VENDOR.includes(i.status) ? i.amount : balanceOf(i)), 0);
    return { status, count: list.length, amount };
  });
  return (
    <nav className="route" aria-label="Invoices by stage">
      {stages.map((s) => (
        <Link key={s.status} to={`/invoices?status=${s.status === 'verification_failed' ? 'fix' : s.status}`} className={`stage ${STATUS[s.status].tone}`}>
          <span className="stage-name">{STATUS[s.status].label}</span>
          <span className="stage-count">{s.count}</span>
          <span className="stage-amount">{money(s.amount)}</span>
        </Link>
      ))}
    </nav>
  );
}
