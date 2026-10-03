import { Document, Page, Text, View, StyleSheet, Font, renderToBuffer } from '@react-pdf/renderer';
import { notoSansRegularBase64, notoSansBoldBase64 } from '../assets/notoSansFonts.js';
import type { OrderWithId, Settings } from './schemas.js';
import { formatINR } from './money.js';

/**
 * The PDF's default fonts (Helvetica etc., the PDF spec's built-in "base 14")
 * only cover WinAnsi encoding, which does NOT include ₹ (U+20B9) — it silently
 * renders as the wrong glyph ("¹") instead of erroring, which is exactly the
 * kind of bug that ships unnoticed if nobody actually opens the PDF and reads
 * the total. Verified by generating a real PDF and extracting its text layer,
 * not by assuming: the latin-ext subset of Noto Sans is the first one that
 * actually contains the Rupee sign — plain "latin" does not.
 *
 * The font is embedded as base64 (src/assets/notoSansFonts.ts), not read from
 * a file path at runtime — see that file for why a path-based approach
 * doesn't survive Astro's build pipeline intact.
 */
const FONT_FAMILY = 'NotoSans';
let fontRegistered = false;

function ensureFontRegistered() {
  if (fontRegistered) return;
  Font.register({
    family: FONT_FAMILY,
    fonts: [
      { src: `data:font/ttf;base64,${notoSansRegularBase64}` },
      { src: `data:font/ttf;base64,${notoSansBoldBase64}`, fontWeight: 'bold' },
    ],
  });
  fontRegistered = true;
}

const styles = StyleSheet.create({
  page: { padding: 40, fontFamily: FONT_FAMILY, fontSize: 10, color: '#2b2520' },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', borderBottom: '1pt solid #f6cdd5', paddingBottom: 16 },
  businessName: { fontSize: 16, fontWeight: 'bold', color: '#932f47' },
  muted: { color: '#4a4038', fontSize: 9, marginTop: 2 },
  right: { textAlign: 'right' },
  badge: { marginTop: 6, alignSelf: 'flex-end', backgroundColor: '#fbe9ec', color: '#932f47', fontSize: 9, paddingVertical: 3, paddingHorizontal: 8, borderRadius: 10 },
  section: { marginTop: 20, flexDirection: 'row', justifyContent: 'space-between' },
  label: { fontSize: 9, fontWeight: 'bold', color: '#2b2520', marginBottom: 2 },
  table: { marginTop: 24 },
  tableHeaderRow: { flexDirection: 'row', borderBottom: '1pt solid #f6cdd5', paddingBottom: 6 },
  tableRow: { flexDirection: 'row', borderBottom: '0.5pt solid #faf5ec', paddingVertical: 8 },
  colName: { flex: 3 },
  colQty: { flex: 1, textAlign: 'right' },
  colPrice: { flex: 1.3, textAlign: 'right' },
  colAmount: { flex: 1.3, textAlign: 'right', fontWeight: 'bold' },
  tableHeaderText: { fontSize: 8, color: '#4a4038', textTransform: 'uppercase' },
  itemNote: { fontSize: 8, color: '#4a4038', marginTop: 2 },
  totalRow: { marginTop: 12, flexDirection: 'row', justifyContent: 'flex-end', borderTop: '1pt solid #f6cdd5', paddingTop: 12 },
  totalLabel: { fontSize: 10, color: '#4a4038', marginRight: 12 },
  totalValue: { fontSize: 16, fontWeight: 'bold', color: '#2b2520' },
  footer: { marginTop: 40, textAlign: 'center', fontSize: 8, color: '#4a4038' },
});

const STATUS_LABEL: Record<string, string> = {
  pending: 'Awaiting confirmation', confirmed: 'Confirmed', preparing: 'Preparing', out_for_delivery: 'Out for delivery',
  delivered: 'Delivered', cancelled: 'Cancelled',
};

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
  } catch {
    return iso;
  }
}

/**
 * Mirrors /account/orders/[code].astro's layout — same document, two
 * renderers.
 *
 * Every dynamic value below is interpolated as a single template-literal
 * string (`` `Order #${order.orderCode}` ``), never as JSX's normal
 * `Order #{order.orderCode}` (which compiles to TWO separate children
 * passed to <Text>). That's deliberate, not a style preference: with this
 * custom embedded font, @react-pdf/renderer only subsets/embeds glyphs
 * correctly for a <Text>'s FIRST child — a second child (the actual dynamic
 * value, in every real case here) silently renders as empty glyph boxes
 * instead of erroring. Confirmed by rendering an actual PDF to an image and
 * looking at it, not by reading the extracted text layer (which has its own,
 * separate quirks with subsetted fonts) and not by assuming either form
 * would behave the same, since visually-identical JSX can compile to
 * structurally different children.
 */
function InvoiceDocument({ order, settings }: { order: OrderWithId; settings: Settings }) {
  return (
    <Document title={`Invoice ${order.orderCode}`}>
      <Page size="A4" style={styles.page}>
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.businessName}>{settings.businessName}</Text>
            {settings.deliveryAreas ? <Text style={styles.muted}>{settings.deliveryAreas}</Text> : null}
            {settings.whatsappNumber ? <Text style={styles.muted}>{`WhatsApp: +${settings.whatsappNumber}`}</Text> : null}
          </View>
          <View style={styles.right}>
            <Text style={{ fontSize: 11, fontWeight: 'bold' }}>{`Order #${order.orderCode}`}</Text>
            <Text style={styles.muted}>{fmtDate(order.createdAt)}</Text>
            <Text style={styles.badge}>{STATUS_LABEL[order.status] ?? order.status}</Text>
          </View>
        </View>

        <View style={styles.section}>
          <View style={{ flex: 1 }}>
            <Text style={styles.label}>Billed to</Text>
            <Text>{order.customerName}</Text>
            <Text style={styles.muted}>{`+${order.customerPhone}`}</Text>
          </View>
          {order.deliveryAddress ? (
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>Delivery address</Text>
              <Text>{order.deliveryAddress}</Text>
              {order.deliveryDate ? <Text style={styles.muted}>{`Needed by: ${order.deliveryDate}`}</Text> : null}
            </View>
          ) : null}
        </View>

        <View style={styles.table}>
          <View style={styles.tableHeaderRow}>
            <Text style={[styles.colName, styles.tableHeaderText]}>Item</Text>
            <Text style={[styles.colQty, styles.tableHeaderText]}>Qty</Text>
            <Text style={[styles.colPrice, styles.tableHeaderText]}>Price</Text>
            <Text style={[styles.colAmount, styles.tableHeaderText]}>Amount</Text>
          </View>
          {order.items.map((item, i) => (
            <View style={styles.tableRow} key={i}>
              <View style={styles.colName}>
                <Text>{item.name}</Text>
                {item.note ? <Text style={styles.itemNote}>{item.note}</Text> : null}
              </View>
              <Text style={styles.colQty}>{item.qty}</Text>
              <Text style={styles.colPrice}>{formatINR(item.price)}</Text>
              <Text style={styles.colAmount}>{formatINR(item.price * item.qty)}</Text>
            </View>
          ))}
        </View>

        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>Total</Text>
          <Text style={styles.totalValue}>{formatINR(order.total)}</Text>
        </View>

        <Text style={styles.footer}>
          Thank you for your order! Reach us anytime on WhatsApp for questions about this order.
        </Text>
      </Page>
    </Document>
  );
}

export async function generateInvoicePdf(order: OrderWithId, settings: Settings): Promise<Buffer> {
  ensureFontRegistered();
  return renderToBuffer(<InvoiceDocument order={order} settings={settings} />);
}
