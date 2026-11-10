/**
 * Canonical domain enums shared across the CircleUp Backend, Customer CRM,
 * Owner CRM, and Public Storefront.
 */

export const ActorType = {
  CUSTOMER: 'CUSTOMER',
  ADMIN: 'ADMIN',
  SYSTEM: 'SYSTEM',
} as const;
export type ActorType = (typeof ActorType)[keyof typeof ActorType];

export const Role = {
  GUEST: 'GUEST',
  CUSTOMER: 'CUSTOMER',
  STAFF: 'STAFF',
  OWNER: 'OWNER',
} as const;
export type Role = (typeof Role)[keyof typeof Role];

export const UserStatus = {
  PENDING_VERIFICATION: 'PENDING_VERIFICATION',
  ACTIVE: 'ACTIVE',
  SUSPENDED: 'SUSPENDED',
  DELETED: 'DELETED',
} as const;
export type UserStatus = (typeof UserStatus)[keyof typeof UserStatus];

export const AdminPermission = {
  ALL: '*',
  PRODUCTS_WRITE: 'PRODUCTS_WRITE',
  INVENTORY_ADJUST: 'INVENTORY_ADJUST',
  ORDERS_MANAGE: 'ORDERS_MANAGE',
  RENTALS_MANAGE: 'RENTALS_MANAGE',
  CUSTOMERS_READ: 'CUSTOMERS_READ',
  COMMUNITY_MODERATE: 'COMMUNITY_MODERATE',
  CMS_WRITE: 'CMS_WRITE',
  ANALYTICS_READ: 'ANALYTICS_READ',
} as const;
export type AdminPermission = (typeof AdminPermission)[keyof typeof AdminPermission];

export const ProductType = {
  PRE_LOVED: 'PRE_LOVED',
  FRESH_FINDS: 'FRESH_FINDS',
  RENTAL: 'RENTAL',
  HANDCRAFTED: 'HANDCRAFTED',
} as const;
export type ProductType = (typeof ProductType)[keyof typeof ProductType];

export const InventoryMode = {
  SINGLE_UNIT: 'SINGLE_UNIT',
  MULTI_UNIT: 'MULTI_UNIT',
} as const;
export type InventoryMode = (typeof InventoryMode)[keyof typeof InventoryMode];

export const ProductCondition = {
  NEW_WITH_TAGS: 'NEW_WITH_TAGS',
  MINT: 'MINT',
  GENTLY_USED: 'GENTLY_USED',
  VINTAGE_WEAR: 'VINTAGE_WEAR',
  NEW_ARTISAN: 'NEW_ARTISAN',
} as const;
export type ProductCondition = (typeof ProductCondition)[keyof typeof ProductCondition];

export const ProductStatus = {
  DRAFT: 'DRAFT',
  ACTIVE: 'ACTIVE',
  SOLD_OUT: 'SOLD_OUT',
  ARCHIVED: 'ARCHIVED',
} as const;
export type ProductStatus = (typeof ProductStatus)[keyof typeof ProductStatus];

export const CheckoutRequestStatus = {
  INITIATED: 'INITIATED',
  RESERVED_AWAITING_PAYMENT: 'RESERVED_AWAITING_PAYMENT',
  CONVERTED_TO_ORDER: 'CONVERTED_TO_ORDER',
  REJECTED: 'REJECTED',
  EXPIRED: 'EXPIRED',
  CANCELLED_BY_USER: 'CANCELLED_BY_USER',
} as const;
export type CheckoutRequestStatus =
  (typeof CheckoutRequestStatus)[keyof typeof CheckoutRequestStatus];

export const OrderStatus = {
  CONFIRMED: 'CONFIRMED',
  PACKED: 'PACKED',
  SHIPPED: 'SHIPPED',
  OUT_FOR_DELIVERY: 'OUT_FOR_DELIVERY',
  DELIVERED: 'DELIVERED',
  CANCELLED: 'CANCELLED',
  RETURN_REQUESTED: 'RETURN_REQUESTED',
  RETURNED: 'RETURNED',
  REFUNDED: 'REFUNDED',
} as const;
export type OrderStatus = (typeof OrderStatus)[keyof typeof OrderStatus];

export const PaymentMethod = {
  WHATSAPP_UPI: 'WHATSAPP_UPI',
  WHATSAPP_BANK_TRANSFER: 'WHATSAPP_BANK_TRANSFER',
  CASH_ON_DELIVERY: 'CASH_ON_DELIVERY',
  RAZORPAY_FUTURE: 'RAZORPAY_FUTURE',
} as const;
export type PaymentMethod = (typeof PaymentMethod)[keyof typeof PaymentMethod];

export const PaymentStatus = {
  PENDING: 'PENDING',
  PAID: 'PAID',
  PARTIALLY_REFUNDED: 'PARTIALLY_REFUNDED',
  REFUNDED: 'REFUNDED',
  FAILED: 'FAILED',
} as const;
export type PaymentStatus = (typeof PaymentStatus)[keyof typeof PaymentStatus];

export const RentalStatus = {
  REQUESTED: 'REQUESTED',
  APPROVED: 'APPROVED',
  DEPOSIT_PAID: 'DEPOSIT_PAID',
  DISPATCHED: 'DISPATCHED',
  ACTIVE: 'ACTIVE',
  EXTENDED: 'EXTENDED',
  OVERDUE: 'OVERDUE',
  RETURNED_INSPECTING: 'RETURNED_INSPECTING',
  COMPLETED: 'COMPLETED',
  REJECTED: 'REJECTED',
  CANCELLED: 'CANCELLED',
} as const;
export type RentalStatus = (typeof RentalStatus)[keyof typeof RentalStatus];

export const RentalTransactionType = {
  RENTAL_FEE_PAID: 'RENTAL_FEE_PAID',
  DEPOSIT_COLLECTED: 'DEPOSIT_COLLECTED',
  LATE_FEE_ASSESSED: 'LATE_FEE_ASSESSED',
  DAMAGE_FEE_ASSESSED: 'DAMAGE_FEE_ASSESSED',
  DEPOSIT_REFUNDED: 'DEPOSIT_REFUNDED',
  DEPOSIT_FORFEITED: 'DEPOSIT_FORFEITED',
} as const;
export type RentalTransactionType =
  (typeof RentalTransactionType)[keyof typeof RentalTransactionType];

export const ModerationStatus = {
  PENDING: 'PENDING',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
} as const;
export type ModerationStatus = (typeof ModerationStatus)[keyof typeof ModerationStatus];

export const EventStatus = {
  DRAFT: 'DRAFT',
  PUBLISHED: 'PUBLISHED',
  CLOSED: 'CLOSED',
  CANCELLED: 'CANCELLED',
  COMPLETED: 'COMPLETED',
} as const;
export type EventStatus = (typeof EventStatus)[keyof typeof EventStatus];

export const InventoryAction = {
  INITIAL_STOCK: 'INITIAL_STOCK',
  RESERVE: 'RESERVE',
  RELEASE_RESERVATION: 'RELEASE_RESERVATION',
  DEDUCT_SALE: 'DEDUCT_SALE',
  RESTORE_CANCEL: 'RESTORE_CANCEL',
  RESTORE_RETURN: 'RESTORE_RETURN',
  MANUAL_ADJUST: 'MANUAL_ADJUST',
  ARCHIVE_ZERO: 'ARCHIVE_ZERO',
} as const;
export type InventoryAction = (typeof InventoryAction)[keyof typeof InventoryAction];

export const NotificationEventType = {
  WELCOME_VERIFIED: 'WELCOME_VERIFIED',
  ORDER_CONFIRMED: 'ORDER_CONFIRMED',
  ORDER_STATUS_CHANGED: 'ORDER_STATUS_CHANGED',
  RENTAL_APPROVED: 'RENTAL_APPROVED',
  RENTAL_REJECTED: 'RENTAL_REJECTED',
  RENTAL_RETURN_REMINDER: 'RENTAL_RETURN_REMINDER',
  RENTAL_OVERDUE: 'RENTAL_OVERDUE',
  EVENT_REGISTERED: 'EVENT_REGISTERED',
  COMMUNITY_POST_APPROVED: 'COMMUNITY_POST_APPROVED',
  COMMUNITY_POST_REJECTED: 'COMMUNITY_POST_REJECTED',
  ADMIN_NEW_CHECKOUT: 'ADMIN_NEW_CHECKOUT',
  ADMIN_NEW_RENTAL: 'ADMIN_NEW_RENTAL',
  ADMIN_RENTAL_OVERDUE: 'ADMIN_RENTAL_OVERDUE',
} as const;
export type NotificationEventType =
  (typeof NotificationEventType)[keyof typeof NotificationEventType];

export const SiteContentKey = {
  HOME_HERO: 'HOME_HERO',
  HOME_PROMO_STRIP: 'HOME_PROMO_STRIP',
  ABOUT_US: 'ABOUT_US',
  CONTACT_INFO: 'CONTACT_INFO',
  POLICY_TERMS: 'POLICY_TERMS',
  POLICY_PRIVACY: 'POLICY_PRIVACY',
  POLICY_RENTAL: 'POLICY_RENTAL',
  POLICY_RETURNS: 'POLICY_RETURNS',
  STORE_OPERATIONS: 'STORE_OPERATIONS',
} as const;
export type SiteContentKey = (typeof SiteContentKey)[keyof typeof SiteContentKey];

