import { Link } from 'react-router-dom';
import { ROUTE, STATUS, money, balanceOf } from '../format';

// "Needs fixing" also holds rejected invoices: both go back to finance.
const inStage = (i, status) => i.status === status || (status === 'verification_failed' && i.status === 'rejected');

// The payment route: every invoice in the system, grouped by where it is in the flow.
export default function Route({ invoices }) {
  const stages = ROUTE.map((status) => {
    const list = invoices.filter((i) => inStage(i, status));
    const amount = list.reduce((s, i) => s + (['paid', 'rejected', 'verification_failed'].includes(i.status) ? i.amount : balanceOf(i)), 0);
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
