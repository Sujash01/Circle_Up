import { Router } from 'express';
import multer from 'multer';
import { adminAuthController } from '../../controllers/admin/adminAuth.controller.js';
import { adminProductController } from '../../controllers/admin/adminProduct.controller.js';
import { adminOrderController } from '../../controllers/admin/adminOrder.controller.js';
import { adminMediaController } from '../../controllers/admin/adminMedia.controller.js';
import { adminSettingsController } from '../../controllers/admin/adminSettings.controller.js';
import { adminCouponController } from '../../controllers/admin/adminCoupon.controller.js';
import { adminRentalController } from '../../controllers/admin/adminRental.controller.js';
import { adminEventController } from '../../controllers/admin/adminEvent.controller.js';
import { adminCustomerController } from '../../controllers/admin/adminCustomer.controller.js';
import { adminOverviewController } from '../../controllers/admin/adminOverview.controller.js';
import { adminInquiryController } from '../../controllers/admin/adminInquiry.controller.js';
import { requireAdminAuth, verifyAdminCsrf } from '../../middleware/adminAuth.js';
import { adminAuthRateLimiter, adminOrderReauthenticationLimiter } from '../../middleware/rateLimiter.js';
import { noStoreCache } from '../../middleware/cacheControl.js';

export const adminRouter = Router();

// Configure multer for memory storage (files kept in buffer for real MIME verification & Sharp processing)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 }, // 8MB limit
});

// Admin routes must never be cached by CDN or browser
adminRouter.use(noStoreCache);

// === DASHBOARD OVERVIEW & AGGREGATES (P1-6) ===
adminRouter.get('/overview', requireAdminAuth(), adminOverviewController.getOverview);

// === AUTHENTICATION ===
adminRouter.post('/auth/login', adminAuthRateLimiter, adminAuthController.login);
adminRouter.post('/auth/logout', requireAdminAuth(), verifyAdminCsrf, adminAuthController.logout);
adminRouter.get('/auth/me', requireAdminAuth(), adminAuthController.me);
adminRouter.post(
  '/auth/change-password',
  requireAdminAuth(),
  verifyAdminCsrf,
  adminAuthController.changePassword,
);
adminRouter.get('/users', requireAdminAuth('owner'), adminAuthController.listUsers);
adminRouter.get('/users/:id', requireAdminAuth('owner'), adminAuthController.getUser);
adminRouter.post('/users', requireAdminAuth('owner'), verifyAdminCsrf, adminAuthController.createUser);
adminRouter.patch('/users/:id', requireAdminAuth('owner'), verifyAdminCsrf, adminAuthController.updateUser);

// === PRODUCTS (CRUD, BULK, SOFT & PERMANENT DELETE) ===
adminRouter.get('/products', requireAdminAuth(), adminProductController.list);
adminRouter.get('/products/:id', requireAdminAuth(), adminProductController.getById);
adminRouter.post('/products', requireAdminAuth(), verifyAdminCsrf, adminProductController.create);
adminRouter.put('/products/:id', requireAdminAuth(), verifyAdminCsrf, adminProductController.update);
adminRouter.post(
  '/products/:id/duplicate',
  requireAdminAuth(),
  verifyAdminCsrf,
  adminProductController.duplicate,
);
adminRouter.post('/products/bulk', requireAdminAuth(), verifyAdminCsrf, adminProductController.bulk);
adminRouter.delete(
  '/products/:id',
  requireAdminAuth(),
  verifyAdminCsrf,
  adminProductController.softDelete,
);
adminRouter.post(
  '/products/:id/restore',
  requireAdminAuth(),
  verifyAdminCsrf,
  adminProductController.restore,
);
adminRouter.delete(
  '/products/:id/permanent',
  requireAdminAuth('owner'),
  verifyAdminCsrf,
  adminProductController.permanentDelete,
);

// === ORDERS (LIST & STATUS TRANSITIONS) ===
adminRouter.get('/orders/reconciliation', requireAdminAuth('owner'), adminOrderController.getReconciliation);
adminRouter.get('/orders', requireAdminAuth(), adminOrderController.list);
adminRouter.post('/orders/:id/cancel', requireAdminAuth('owner'), verifyAdminCsrf,
  adminOrderReauthenticationLimiter, adminOrderController.cancel);
adminRouter.put(
  '/orders/:id/status',
  requireAdminAuth(),
  verifyAdminCsrf,
  adminOrderController.updateStatus,
);
adminRouter.put(
  '/orders/:id/payment-status',
  requireAdminAuth('owner'),
  verifyAdminCsrf,
  adminOrderController.markPaymentReceived,
);
adminRouter.post(
  '/orders/:id/refunds',
  requireAdminAuth('owner'),
  verifyAdminCsrf,
  adminOrderController.processRefund,
);
adminRouter.post(
  '/orders/:id/returns/inspection',
  requireAdminAuth(),
  verifyAdminCsrf,
  adminOrderController.recordReturnInspection,
);
adminRouter.post(
  '/orders/:id/reservation/release',
  requireAdminAuth('owner'),
  verifyAdminCsrf,
  adminOrderReauthenticationLimiter,
  adminOrderController.authorizeReservationRelease,
);
adminRouter.post(
  '/orders/:id/fulfillments',
  requireAdminAuth(),
  verifyAdminCsrf,
  adminOrderController.createFulfillment,
);

// === INQUIRIES (CONTACT INBOX) ===
adminRouter.get('/inquiries', requireAdminAuth(), adminInquiryController.list);
adminRouter.get('/inquiries/:id', requireAdminAuth(), adminInquiryController.getById);
adminRouter.patch('/inquiries/:id', requireAdminAuth(), verifyAdminCsrf, adminInquiryController.update);

// === CUSTOMERS (CRM) ===
adminRouter.get('/customers', requireAdminAuth(), adminCustomerController.list);
adminRouter.get('/customers/:id', requireAdminAuth(), adminCustomerController.getById);
adminRouter.patch('/customers/:id', requireAdminAuth('owner'), verifyAdminCsrf, adminCustomerController.update);

// === MEDIA UPLOAD ===
adminRouter.post(
  '/media/upload',
  requireAdminAuth(),
  verifyAdminCsrf,
  upload.array('images', 5),
  adminMediaController.upload,
);
adminRouter.delete('/media', requireAdminAuth(), verifyAdminCsrf, adminMediaController.delete);

// === SITE SETTINGS (OWNER ONLY FOR MUTATION) ===
adminRouter.get('/settings', requireAdminAuth(), adminSettingsController.getSettings);
adminRouter.put(
  '/settings',
  requireAdminAuth('owner'),
  verifyAdminCsrf,
  adminSettingsController.updateSettings,
);
adminRouter.get('/activity', requireAdminAuth('owner'), adminSettingsController.getActivity);

// === COUPONS ===
adminRouter.get('/coupons', requireAdminAuth(), adminCouponController.list);
adminRouter.post('/coupons', requireAdminAuth(), verifyAdminCsrf, adminCouponController.create);
adminRouter.put('/coupons/:id', requireAdminAuth(), verifyAdminCsrf, adminCouponController.update);
adminRouter.delete(
  '/coupons/:id',
  requireAdminAuth('owner'),
  verifyAdminCsrf,
  adminCouponController.delete,
);

// === RENTALS ===
adminRouter.get('/rental-bookings', requireAdminAuth(), adminRentalController.listBookings);
adminRouter.patch('/rental-bookings/:id', requireAdminAuth(), verifyAdminCsrf, adminRentalController.updateBooking);
adminRouter.get('/rentals', requireAdminAuth(), adminRentalController.list);
adminRouter.post('/rentals', requireAdminAuth(), verifyAdminCsrf, adminRentalController.create);
adminRouter.put('/rentals/:id', requireAdminAuth(), verifyAdminCsrf, adminRentalController.update);
adminRouter.delete('/rentals/:id', requireAdminAuth('owner'), verifyAdminCsrf, adminRentalController.delete);

// === EVENTS ===
adminRouter.get('/events', requireAdminAuth(), adminEventController.list);
adminRouter.post('/events', requireAdminAuth(), verifyAdminCsrf, adminEventController.create);
adminRouter.put('/events/:id', requireAdminAuth(), verifyAdminCsrf, adminEventController.update);
adminRouter.delete('/events/:id', requireAdminAuth('owner'), verifyAdminCsrf, adminEventController.delete);

