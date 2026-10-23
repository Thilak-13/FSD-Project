import { Link, useParams } from 'react-router-dom';
import api, { useLoad, errMsg } from '../api';
import { useAuth } from '../auth';
import { useToast } from '../components/Toast';
import StatusBadge from '../components/StatusBadge';
import { money, date } from '../format';
import { poLimit, PO_TOLERANCE_TEXT } from '../../../server/services/verify.js';
import useTitle from '../useTitle';

export default function PurchaseOrderDetail() {
  const { id } = useParams();
  const { can, isVendor } = useAuth();
  const toast = useToast();
  const [po, reload, error] = useLoad(`/purchase-orders/${id}`);
  useTitle(po?.poNumber || 'Purchase order');

  if (error) return <p className="error" role="alert">{error}</p>;
  if (!po) return <div className="loading" role="status">Loading purchase order…</div>;

  const limit = poLimit(po.amount);
  const left = Math.max(limit - po.invoiced, 0);
  const toggle = async () => {
    try {
      await api.put(`/purchase-orders/${po._id}`, { status: po.status === 'open' ? 'closed' : 'open' });
      toast(po.status === 'open' ? `${po.poNumber} closed. No new bills can be sent against it.` : `${po.poNumber} reopened.`);
      reload();
    } catch (e) { toast(errMsg(e), 'bad'); }
  };
  const fact = (label, value) => <div><dt>{label}</dt><dd>{value || <span className="muted">Not recorded</span>}</dd></div>;

  return (
    <>
      <Link to="/purchase-orders" className="back">All purchase orders</Link>
      <div className="page-header">
        <div>
          <h1>{po.poNumber} <span className={`badge ${po.status === 'open' ? 'pay' : 'neutral'}`}>{po.status === 'open' ? 'Open' : 'Closed'}</span></h1>
          <p className="lede">{po.description || 'No description was recorded for this order.'}</p>
        </div>
        {can('finance') && <div className="page-actions"><button className="btn" onClick={toggle}>{po.status === 'open' ? 'Close order' : 'Reopen order'}</button></div>}
      </div>

      <div className="detail-grid">
        <section className="panel">
          <h2>Why this order exists</h2>
          <dl className="meta-grid">
            <div className="wide"><dt>Reason</dt><dd>{po.purpose || <span className="muted">Not recorded</span>}</dd></div>
            {fact('Requested by', po.requestedBy)}
            {fact('Needed by', po.neededBy && date(po.neededBy))}
            {fact('Raised by', po.createdBy?.name && `${po.createdBy.name}, ${date(po.createdAt)}`)}
            {fact(isVendor ? 'Placed with you' : 'Vendor', !isVendor && po.vendor?.name ? `${po.vendor.name}${po.vendor.gstin ? `, GSTIN ${po.vendor.gstin}` : ''}` : date(po.createdAt))}
          </dl>
        </section>

        <section className="panel">
          <h2>How much is left to bill</h2>
          <div className="sum-well">
            <div><span>Order amount</span><span>{money(po.amount)}</span></div>
            <div><span>Allowed with the {PO_TOLERANCE_TEXT} margin</span><span>{money(limit)}</span></div>
            <div><span>Billed so far</span><span>− {money(po.invoiced)}</span></div>
            <div className="total"><span>{po.status === 'open' ? 'Still available' : 'Closed, nothing more can be billed'}</span><span>{po.status === 'open' ? money(left) : '—'}</span></div>
          </div>
          <span className="po-bar" aria-hidden="true"><i className={po.invoiced > po.amount ? 'over' : po.invoiced >= po.amount * 0.85 ? 'near' : ''} style={{ width: `${Math.min((po.invoiced / po.amount) * 100, 100)}%` }} /></span>
          <p className="muted small" style={{ marginTop: '.75rem' }}>Bills that failed a check or were sent back don't count until they're resubmitted.</p>
        </section>
      </div>

      <section className="panel" style={{ marginTop: '1.25rem' }}>
        <h2>Bills against this order</h2>
        {po.invoices.length === 0 ? <p className="empty-line">No bills yet. {isVendor && po.status === 'open' ? 'Pick this order when you send a bill for it.' : ''}</p> : (
          <table className="compact" style={{ marginTop: '.75rem' }}>
            <thead><tr><th>Invoice</th><th>Date</th><th className="num">Amount</th><th>Status</th></tr></thead>
            <tbody>
              {po.invoices.map((i) => (
                <tr key={i._id}>
                  <td><Link to={`/invoices/${i._id}`} className="inv-no">{i.invoiceNumber}</Link></td>
                  <td>{date(i.invoiceDate)}</td>
                  <td className="num">{money(i.amount)}</td>
                  <td><StatusBadge invoice={i} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </>
  );
}
