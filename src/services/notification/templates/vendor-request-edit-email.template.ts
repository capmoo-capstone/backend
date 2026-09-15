import { BusinessEmailContent, escapeHtml } from '../business-email-content';

export interface VendorRequestEditEmailData {
  poNumber: string;
  vendorName?: string | null;
  additionalMessage?: string | null;
  installmentNo?: number | null;
  reason?: string | null;
}

export interface VendorRequestEditEmailPreview {
  subject: string;
  lockedBody: string;
  vendorFormUrl: string;
  autoNotice: string;
}

const AUTOMATED_NOTICE =
  '(อีเมลฉบับนี้เป็นอีเมลอัตโนมัติ กรุณาอย่าตอบกลับอีเมลฉบับนี้)';

const CU_PROCUREMENT_CLOSING_TEXT = [
  'ขอแสดงความนับถือ',
  'ฝ่ายการพัสดุ สำนักบริหารการเงิน การบัญชี และการพัสดุ จุฬาลงกรณ์มหาวิทยาลัย',
  'ชั้น 2 อาคารจามจุรี 5 ถนนพญาไท',
  'แขวงวังใหม่ เขตปทุมวัน กรุงเทพมหานคร 10330',
  'หมายเลขโทรศัพท์: 0 2218 0080',
  '',
  AUTOMATED_NOTICE,
].join('\n');

const CU_PROCUREMENT_CLOSING_HTML = [
  '<p>ขอแสดงความนับถือ<br /><strong>ฝ่ายการพัสดุ สำนักบริหารการเงิน การบัญชี และการพัสดุ จุฬาลงกรณ์มหาวิทยาลัย</strong><br />ชั้น 2 อาคารจามจุรี 5 ถนนพญาไท<br />แขวงวังใหม่ เขตปทุมวัน กรุงเทพมหานคร 10330<br />หมายเลขโทรศัพท์: 0 2218 0080</p>',
  `<p><em>${AUTOMATED_NOTICE}</em></p>`,
].join('\n');

export const buildVendorRequestEditFormUrl = (
  poNumber?: string | null,
  installmentNo?: number | null
): string => {
  const envAppUrl = (
    process.env.VENDOR_APP_PUBLIC_URL ||
    process.env.APP_PUBLIC_URL ||
    ''
  ).trim();
  const baseUrl = envAppUrl
    ? envAppUrl.replace(/\/+$/, '')
    : 'https://vendor.nexus-procure.com';

  const params = new URLSearchParams();
  if (poNumber?.trim()) {
    params.set('po', poNumber.trim());
  }
  if (installmentNo !== undefined && installmentNo !== null) {
    params.set('installment', String(installmentNo));
  }

  const query = params.toString();
  return query ? `${baseUrl}?${query}` : baseUrl;
};

export const renderVendorRequestEditEmailPreview = (
  data: VendorRequestEditEmailData
): VendorRequestEditEmailPreview => {
  const poLabel = data.poNumber?.trim() || '-';
  const label = data.vendorName?.trim() || 'บริษัทคู่ค้า';
  const reasonText = data.reason?.trim() || '-';
  const installmentText = data.installmentNo
    ? ` (งวดที่ ${data.installmentNo})`
    : '';
  const vendorFormUrl = buildVendorRequestEditFormUrl(
    data.poNumber,
    data.installmentNo
  );

  const lockedBody = [
    `เรียน ${label}`,
    '',
    `ฝ่ายการพัสดุ สำนักบริหารการเงิน การบัญชี และการพัสดุ จุฬาลงกรณ์มหาวิทยาลัย ขอแจ้งให้ท่านทราบว่าเอกสารใบแจ้งหนี้/ใบส่งของ/ใบวางบิล สำหรับใบสั่งซื้อหมายเลข ${poLabel}${installmentText} ที่ท่านได้ส่งมา มีข้อที่ต้องแก้ไขเพิ่มเติม ดังนี้:`,
    '',
    `เหตุผลในการขอแก้ไข: ${reasonText}`,
    '',
    `กรุณาดำเนินการแก้ไขและส่งเอกสารใหม่ในระบบ NexusProcure ผ่านลิงก์ ${vendorFormUrl}`,
  ].join('\n');

  const subject = `ขอให้แก้ไขเอกสารใบแจ้งหนี้/ใบส่งของ/ใบวางบิล สำหรับใบสั่งซื้อหมายเลข ${poLabel}${installmentText}`;

  return {
    subject,
    lockedBody,
    vendorFormUrl,
    autoNotice: AUTOMATED_NOTICE,
  };
};

export const renderVendorRequestEditEmailContent = (
  data: VendorRequestEditEmailData
): BusinessEmailContent => {
  const preview = renderVendorRequestEditEmailPreview(data);
  const poLabel = data.poNumber?.trim() || '-';
  const label = data.vendorName?.trim() || 'บริษัทคู่ค้า';
  const reasonText = data.reason?.trim() || '-';
  const installmentText = data.installmentNo
    ? ` (งวดที่ ${data.installmentNo})`
    : '';

  const textParts = [preview.lockedBody];

  if (data.additionalMessage && data.additionalMessage.trim()) {
    textParts.push('', data.additionalMessage.trim());
  }

  textParts.push('', CU_PROCUREMENT_CLOSING_TEXT);

  const htmlParts = [
    `<p>เรียน ${escapeHtml(label)}</p>`,
    `<p>ฝ่ายการพัสดุ สำนักบริหารการเงิน การบัญชี และการพัสดุ จุฬาลงกรณ์มหาวิทยาลัย ขอแจ้งให้ท่านทราบว่าเอกสารใบแจ้งหนี้/ใบส่งของ/ใบวางบิล สำหรับใบสั่งซื้อหมายเลข <strong>${escapeHtml(poLabel)}</strong>${escapeHtml(installmentText)} ที่ท่านได้ส่งมา มีข้อที่ต้องแก้ไขเพิ่มเติม ดังนี้:</p>`,
    `<blockquote><p><strong>เหตุผลในการขอแก้ไข:</strong> ${escapeHtml(reasonText)}</p></blockquote>`,
    `<p>กรุณาดำเนินการแก้ไขและส่งเอกสารใหม่ในระบบ NexusProcure ผ่านลิงก์ <a href="${escapeHtml(preview.vendorFormUrl)}">${escapeHtml(preview.vendorFormUrl)}</a></p>`,
  ];

  if (data.additionalMessage && data.additionalMessage.trim()) {
    const additionalHtml = data.additionalMessage
      .trim()
      .split('\n')
      .map((line) => `<p>${escapeHtml(line) || '&nbsp;'}</p>`)
      .join('\n');
    htmlParts.push(additionalHtml);
  }

  htmlParts.push(CU_PROCUREMENT_CLOSING_HTML);

  return {
    subject: preview.subject,
    text: textParts.join('\n'),
    html: htmlParts.join('\n'),
  };
};
