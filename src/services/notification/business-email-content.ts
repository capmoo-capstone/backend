export interface BusinessEmailContent {
  subject: string;
  text: string;
  html: string;
}

const COMPANY_NAME = 'NexusProcure';
const COMPANY_TAGLINE = 'Connect • Fast • Transparent';
const AUTOMATED_NOTICE =
  '(อีเมลฉบับนี้เป็นอีเมลอัตโนมัติ กรุณาอย่าตอบกลับอีเมลฉบับนี้)';

export const escapeHtml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

export const buildBusinessEmailClosingText = () =>
  [
    'ขอแสดงความนับถือ',
    COMPANY_NAME,
    COMPANY_TAGLINE,
    '',
    AUTOMATED_NOTICE,
  ].join('\n');

export const buildBusinessEmailClosingHtml = () =>
  [
    '<p>ขอแสดงความนับถือ<br /><strong>NexusProcure</strong><br />Connect • Fast • Transparent</p>',
    '<p><em>(อีเมลฉบับนี้เป็นอีเมลอัตโนมัติ กรุณาอย่าตอบกลับอีเมลฉบับนี้)</em></p>',
  ].join('\n');

export const withBusinessEmailClosing = (
  content: BusinessEmailContent
): BusinessEmailContent => ({
  subject: content.subject,
  text: [content.text.trimEnd(), '', buildBusinessEmailClosingText()].join(
    '\n'
  ),
  html: [content.html.trimEnd(), buildBusinessEmailClosingHtml()].join('\n'),
});
