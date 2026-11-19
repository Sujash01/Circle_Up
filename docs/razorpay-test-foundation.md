# Razorpay test foundation

CircleUp does not currently complete online payment checkout. The frontend keeps
Razorpay disabled, and the order API continues to reject `ONLINE_UPI` with
`PAYMENT_PROVIDER_UNAVAILABLE`. No payment can be marked paid by returning from a
provider page.

The backend has an isolated test-mode foundation for creating a Razorpay test
order and validating payment/webhook signatures and captured payment evidence.
It is not wired to customer checkout, order persistence, webhooks, or audit
records; it is not an operational payment integration.

To configure the foundation for safe integration testing, use only credentials
from a Razorpay test account:

- `RAZORPAY_MODE=test`
- `RAZORPAY_KEY_ID` beginning with `rzp_test_`
- `RAZORPAY_KEY_SECRET`
- `RAZORPAY_WEBHOOK_SECRET`

Never use live credentials in local or CI test configuration. The completed
integration still needs an authenticated server-side initiation flow, persisted
provider references, server-side payment lookup and signature verification,
raw-body webhook verification, idempotent/out-of-order event handling, and
transactional payment/audit updates before Razorpay can be enabled in the UI.
Before wiring that flow, reconcile the monetary unit used by current catalog
records and storefront values with the shared API's paise contract. Do not pass
an order total to Razorpay until the stored unit has been confirmed and tested.

WhatsApp / UPI checkout uses the owner-configured `whatsappNumber` site setting.
Until a valid store contact is configured, the option remains unavailable. The
repository's previous placeholder numbers are not shown as payment contacts.
