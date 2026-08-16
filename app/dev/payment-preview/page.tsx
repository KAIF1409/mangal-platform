import Navbar from '../../components/Navbar';
import Footer from '../../components/Footer';
import PaymentMethodPicker from '../../components/PaymentMethodPicker';

// Not linked from any nav — visit directly at /dev/payment-preview to
// review the payment-method UI (§48 follow-up: UI-only, no backend
// wiring). Delete this page once the design is approved and the real
// checkout flow is built somewhere that actually needs it — this route
// only exists for the founder to look at the component in isolation.
export default function PaymentPreviewPage() {
  return (
    <div style={{ minHeight: '100vh', backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)' }}>
      <Navbar />
      <div style={{ maxWidth: '600px', margin: '0 auto', padding: '60px 24px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px' }}>
        <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--accent)', letterSpacing: '0.06em' }}>
          DESIGN PREVIEW — NOT LIVE
        </div>
        <h1 style={{ fontSize: '24px', fontWeight: 900, margin: '0 0 4px', textAlign: 'center' }}>Payment method UI</h1>
        <p style={{ color: 'var(--text-tertiary)', fontSize: '13px', margin: '0 0 24px', textAlign: 'center' }}>
          Card / UPI / Google Pay / Net Banking selector. Not connected to any backend yet — see CONTEXT.md §48.
        </p>
        <PaymentMethodPicker />
      </div>
      <Footer />
    </div>
  );
}
