import { env } from '../config/env.js';
import { formatPrice } from '@circleup/shared';

const logger = console;

export interface SentEmailRecord {
  to: string;
  from: string;
  subject: string;
  html: string;
  text: string;
  sentAt: string;
  success: boolean;
  error?: string;
}

const sentEmailLog: SentEmailRecord[] = [];

export const emailService = {
  getSentEmails(): readonly SentEmailRecord[] {
    return [...sentEmailLog];
  },

  clearSentEmails(): void {
    sentEmailLog.length = 0;
  },

  async sendEmail(payload: { to: string; subject: string; html: string; text: string }): Promise<boolean> {
    const from = env.EMAIL_FROM || 'CircleUp <orders@circleuponline.com>';
    const record: SentEmailRecord = {
      to: payload.to,
      from,
      subject: payload.subject,
      html: payload.html,
      text: payload.text,
      sentAt: new Date().toISOString(),
      success: true,
    };

    if (!env.EMAIL_API_KEY || env.NODE_ENV === 'test') {
      logger.info({ to: payload.to, subject: payload.subject }, '[EmailService] Mock dispatch (test/dev or unconfigured API key)');
      sentEmailLog.push(record);
      return true;
    }

    try {
      // Production delivery via Resend/SendGrid REST API with standard JSON payload
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.EMAIL_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from,
          to: payload.to,
          subject: payload.subject,
          html: payload.html,
          text: payload.text,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        record.success = false;
        record.error = `HTTP ${response.status}: ${errorText}`;
        logger.error({ error: record.error, to: payload.to }, '[EmailService] Delivery failed');
      }
    } catch (err) {
      record.success = false;
      record.error = err instanceof Error ? err.message : 'Unknown network failure';
      logger.error({ error: record.error, to: payload.to }, '[EmailService] Network exception');
    }

    sentEmailLog.push(record);
    return record.success;
  },

  async sendOrderConfirmation(order: {
    orderNumber: string;
    customerEmail?: string;
    customerName?: string;
    totalInPaise: number;
    subtotalInPaise: number;
    deliveryFeeInPaise: number;
    discountInPaise: number;
    shippingAddress?: { street?: string; city?: string; state?: string; postalCode?: string };
  }, items: Array<{ title: string; size?: string; priceInPaise: number; quantity: number }>): Promise<boolean> {
    const to = order.customerEmail;
    if (!to) return false;

    const formattedTotal = formatPrice(order.totalInPaise);
    const itemListText = items.map((i) => `- ${i.title} (Size: ${i.size || 'N/A'}, Qty: ${i.quantity}) - ${formatPrice(i.priceInPaise * i.quantity)}`).join('\n');
    const itemListHtml = items
      .map(
        (i) =>
          `<tr>
            <td style="padding: 8px 12px; border-bottom: 1px solid #e5e0d4;">${i.title}</td>
            <td style="padding: 8px 12px; border-bottom: 1px solid #e5e0d4;">${i.size || 'N/A'}</td>
            <td style="padding: 8px 12px; border-bottom: 1px solid #e5e0d4; text-align: center;">${i.quantity}</td>
            <td style="padding: 8px 12px; border-bottom: 1px solid #e5e0d4; text-align: right;">${formatPrice(i.priceInPaise * i.quantity)}</td>
          </tr>`
      )
      .join('');

    const subject = `Your CircleUp Order ${order.orderNumber} is Confirmed!`;
    const text = `Hello ${order.customerName || 'Friend'},\n\nThank you for choosing pre-loved and circular fashion with CircleUp.\n\nOrder Number: ${order.orderNumber}\nTotal: ${formattedTotal}\n\nItems:\n${itemListText}\n\nDelivery Address:\n${order.shippingAddress?.street || ''}, ${order.shippingAddress?.city || ''}, ${order.shippingAddress?.state || ''} - ${order.shippingAddress?.postalCode || ''}\n\nWarmly,\nCircleUp Team`;
    const html = `
      <div style="font-family: Georgia, serif; max-width: 600px; margin: 0 auto; background: #f8f4e2; color: #2d261e; padding: 24px; border: 1px solid #ded7c6; border-radius: 8px;">
        <h2 style="color: #1e3a29; margin-top: 0;">Fashion That Lasts</h2>
        <p>Hello ${order.customerName || 'Friend'},</p>
        <p>Thank you for choosing pre-loved and circular fashion. Your order <strong>${order.orderNumber}</strong> has been received and confirmed.</p>
        <table style="width: 100%; border-collapse: collapse; margin: 20px 0; background: #ffffff; border-radius: 6px; overflow: hidden;">
          <thead>
            <tr style="background: #1e3a29; color: #ffffff;">
              <th style="padding: 10px 12px; text-align: left;">Item</th>
              <th style="padding: 10px 12px; text-align: left;">Size</th>
              <th style="padding: 10px 12px; text-align: center;">Qty</th>
              <th style="padding: 10px 12px; text-align: right;">Price</th>
            </tr>
          </thead>
          <tbody>${itemListHtml}</tbody>
          <tfoot>
            <tr>
              <td colspan="3" style="padding: 10px 12px; text-align: right; font-weight: bold;">Total:</td>
              <td style="padding: 10px 12px; text-align: right; font-weight: bold; color: #8b0000;">${formattedTotal}</td>
            </tr>
          </tfoot>
        </table>
        <p style="font-size: 13px; color: #6b5e51;">CircleUp • Curated pre-loved, vintage & handcrafted fashion.</p>
      </div>
    `;

    return this.sendEmail({ to, subject, html, text });
  },

  async sendOwnerOrderAlert(order: {
    orderNumber: string;
    customerName?: string;
    customerEmail?: string;
    customerPhone?: string;
    paymentMethod: string;
    totalInPaise: number;
  }, items: Array<{ title: string; quantity: number }>): Promise<boolean> {
    const to = 'admin@circleuponline.com';
    const formattedTotal = formatPrice(order.totalInPaise);
    const subject = `[New Order Alert] ${order.orderNumber} (${formattedTotal}) - ${order.paymentMethod}`;
    const text = `New order received on CircleUp!\n\nOrder: ${order.orderNumber}\nCustomer: ${order.customerName} (${order.customerEmail}, ${order.customerPhone})\nTotal: ${formattedTotal}\nPayment Method: ${order.paymentMethod}\nItems: ${items.map((i) => `${i.title} (x${i.quantity})`).join(', ')}`;
    const html = `
      <div style="font-family: Arial, sans-serif; padding: 20px; background: #fdfaf3; border: 1px solid #dcd4c0;">
        <h3 style="color: #1e3a29; margin-top: 0;">New Order Alert: ${order.orderNumber}</h3>
        <p><strong>Customer:</strong> ${order.customerName || 'N/A'} (${order.customerEmail || 'No email'}, ${order.customerPhone || 'No phone'})</p>
        <p><strong>Payment Method:</strong> ${order.paymentMethod}</p>
        <p><strong>Total:</strong> <span style="color: #8b0000; font-weight: bold;">${formattedTotal}</span></p>
        <p><strong>Items:</strong></p>
        <ul>${items.map((i) => `<li>${i.title} (Qty: ${i.quantity})</li>`).join('')}</ul>
      </div>
    `;

    return this.sendEmail({ to, subject, html, text });
  },

  async sendShippingUpdate(order: {
    orderNumber: string;
    customerEmail?: string;
    customerName?: string;
  }, trackingNumber?: string, carrier?: string): Promise<boolean> {
    const to = order.customerEmail;
    if (!to) return false;

    const carrierText = carrier ? `via ${carrier}` : '';
    const trackingText = trackingNumber ? `Tracking Number: ${trackingNumber}` : '';
    const subject = `Your CircleUp Order ${order.orderNumber} has Shipped!`;
    const text = `Hello ${order.customerName || 'Friend'},\n\nGreat news! Your pre-loved find from CircleUp is on its way ${carrierText}.\n${trackingText}\n\nWarmly,\nCircleUp Team`;
    const html = `
      <div style="font-family: Georgia, serif; max-width: 600px; margin: 0 auto; background: #f8f4e2; padding: 24px; border: 1px solid #ded7c6; border-radius: 8px;">
        <h2 style="color: #1e3a29; margin-top: 0;">Your Find Is On Its Way!</h2>
        <p>Hello ${order.customerName || 'Friend'},</p>
        <p>Your order <strong>${order.orderNumber}</strong> has shipped ${carrierText}.</p>
        ${trackingNumber ? `<p style="padding: 12px; background: #ffffff; border-radius: 4px; font-weight: bold;">Tracking Number: ${trackingNumber}</p>` : ''}
        <p>Thank you for supporting sustainable fashion.</p>
      </div>
    `;

    return this.sendEmail({ to, subject, html, text });
  },

  async sendRefundConfirmation(order: {
    orderNumber: string;
    customerEmail?: string;
    customerName?: string;
  }, refundAmountPaise: number, reason: string): Promise<boolean> {
    const to = order.customerEmail;
    if (!to) return false;

    const formattedAmount = formatPrice(refundAmountPaise);
    const subject = `Refund Processed for CircleUp Order ${order.orderNumber}`;
    const text = `Hello ${order.customerName || 'Friend'},\n\nA refund of ${formattedAmount} has been processed for your order ${order.orderNumber}.\nReason: ${reason}\n\nWarmly,\nCircleUp Team`;
    const html = `
      <div style="font-family: Georgia, serif; max-width: 600px; margin: 0 auto; background: #f8f4e2; padding: 24px; border: 1px solid #ded7c6; border-radius: 8px;">
        <h2 style="color: #1e3a29; margin-top: 0;">Refund Processed</h2>
        <p>Hello ${order.customerName || 'Friend'},</p>
        <p>We have processed a refund of <strong style="color: #8b0000;">${formattedAmount}</strong> for your order <strong>${order.orderNumber}</strong>.</p>
        <p><strong>Reason:</strong> ${reason}</p>
      </div>
    `;

    return this.sendEmail({ to, subject, html, text });
  },

  async sendInquiryReply(to: string, name: string, subject: string, replyMessage: string): Promise<boolean> {
    if (!to) return false;

    const emailSubject = `Re: ${subject || 'Your CircleUp Inquiry'}`;
    const text = `Hello ${name || 'Friend'},\n\nThank you for reaching out to CircleUp.\n\n${replyMessage}\n\nWarmly,\nCircleUp Team`;
    const html = `
      <div style="font-family: Georgia, serif; max-width: 600px; margin: 0 auto; background: #f8f4e2; padding: 24px; border: 1px solid #ded7c6; border-radius: 8px;">
        <h2 style="color: #1e3a29; margin-top: 0;">CircleUp Support</h2>
        <p>Hello ${name || 'Friend'},</p>
        <div style="background: #ffffff; padding: 16px; border-radius: 6px; margin: 16px 0; border: 1px solid #e2dbca; white-space: pre-wrap;">${replyMessage}</div>
        <p style="font-size: 13px; color: #6b5e51;">CircleUp • Fashion That Lasts</p>
      </div>
    `;

    return this.sendEmail({ to, subject: emailSubject, html, text });
  },
};
