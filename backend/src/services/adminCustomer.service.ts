import mongoose from 'mongoose';
import { Order } from '../models/Order.js';
import { NotFoundError } from '../errors/AppError.js';
import { parsePagination, buildPaginationMeta } from '../utils/pagination.js';
import type { Customer, CustomerTier } from '@circleup/shared';

const MOCK_CUSTOMERS: Customer[] = [
  {
    id: 'cust_01',
    name: 'Aanya Sharma',
    email: 'aanya@example.com',
    phone: '+91 98201 12233',
    totalOrders: 3,
    totalSpendInPaise: 1255000,
    firstOrderAt: new Date(Date.now() - 45 * 86400000).toISOString(),
    lastOrderAt: new Date(Date.now() - 2 * 86400000).toISOString(),
    tier: 'VIP',
    city: 'Mumbai',
    state: 'Maharashtra',
    postalCode: '400050',
    addressLine: 'Bandra West, Hill Road',
    notes: 'Loves vintage blazers and handcrafted accessories. Active circular community member.',
    createdAt: new Date(Date.now() - 60 * 86400000).toISOString(),
  },
  {
    id: 'cust_02',
    name: 'Rohan Verma',
    email: 'rohan.v@example.com',
    phone: '+91 98112 44556',
    totalOrders: 2,
    totalSpendInPaise: 745000,
    firstOrderAt: new Date(Date.now() - 28 * 86400000).toISOString(),
    lastOrderAt: new Date(Date.now() - 5 * 86400000).toISOString(),
    tier: 'REGULAR',
    city: 'Bengaluru',
    state: 'Karnataka',
    postalCode: '560038',
    addressLine: 'Indiranagar, 100ft Road',
    notes: 'Regular menswear enthusiast. Interested in vintage jackets.',
    createdAt: new Date(Date.now() - 35 * 86400000).toISOString(),
  },
  {
    id: 'cust_03',
    name: 'Rhea Sen',
    email: 'rhea.sen@example.com',
    phone: '+91 99302 77889',
    totalOrders: 4,
    totalSpendInPaise: 1680000,
    firstOrderAt: new Date(Date.now() - 90 * 86400000).toISOString(),
    lastOrderAt: new Date(Date.now() - 1 * 86400000).toISOString(),
    tier: 'VIP',
    city: 'Delhi',
    state: 'Delhi',
    postalCode: '110024',
    addressLine: 'Defence Colony, Block C',
    notes: 'Frequent rental customer and curated thrift explorer.',
    createdAt: new Date(Date.now() - 100 * 86400000).toISOString(),
  },
  {
    id: 'cust_04',
    name: 'Kabir Mehta',
    email: 'kabir.m@example.com',
    phone: '+91 97654 33221',
    totalOrders: 1,
    totalSpendInPaise: 295000,
    firstOrderAt: new Date(Date.now() - 7 * 86400000).toISOString(),
    lastOrderAt: new Date(Date.now() - 7 * 86400000).toISOString(),
    tier: 'NEW',
    city: 'Pune',
    state: 'Maharashtra',
    postalCode: '411001',
    addressLine: 'Koregaon Park, Lane 5',
    notes: 'First order: vintage corduroy overshirt.',
    createdAt: new Date(Date.now() - 10 * 86400000).toISOString(),
  },
];

export const adminCustomerService = {
  async listCustomers(query: { page?: unknown; limit?: unknown; search?: string; tier?: string }) {
    const { page, limit, skip } = parsePagination(query);

    let customers: Customer[] = [];

    if (mongoose.connection.readyState === 1) {
      try {
        const orders = await Order.find().sort({ createdAt: -1 }).lean();
        const grouped = new Map<string, {
          ordersCount: number;
          totalSpend: number;
          name: string;
          email: string;
          phone: string;
          firstDate: Date;
          lastDate: Date;
          address?: {
            addressLine: string;
            city: string;
            state: string;
            postalCode: string;
          };
        }>();

        for (const ord of orders) {
          const email = ord.customer?.email?.toLowerCase().trim();
          if (!email) continue;

          const existing = grouped.get(email);
          const orderDate = new Date(ord.createdAt);
          const amount = typeof ord.totalAmount === 'number' ? ord.totalAmount : 0;

          if (!existing) {
            grouped.set(email, {
              ordersCount: 1,
              totalSpend: amount,
              name: ord.customer.name || 'Valued Customer',
              email,
              phone: ord.customer.phone || '',
              firstDate: orderDate,
              lastDate: orderDate,
              address: ord.shippingAddress,
            });
          } else {
            existing.ordersCount += 1;
            existing.totalSpend += amount;
            if (orderDate < existing.firstDate) existing.firstDate = orderDate;
            if (orderDate > existing.lastDate) {
              existing.lastDate = orderDate;
              if (ord.shippingAddress) existing.address = ord.shippingAddress;
              if (ord.customer.name) existing.name = ord.customer.name;
              if (ord.customer.phone) existing.phone = ord.customer.phone;
            }
          }
        }

        const dbCustomers: Customer[] = Array.from(grouped.entries()).map(([email, d], idx) => {
          let tier: CustomerTier = 'NEW';
          if (d.totalSpend >= 1000000) tier = 'VIP';
          else if (d.ordersCount >= 2) tier = 'REGULAR';

          return {
            id: `cust_${idx + 1}_${email.replace(/[^a-z0-9]/g, '').slice(0, 8)}`,
            name: d.name,
            email: d.email,
            phone: d.phone,
            totalOrders: d.ordersCount,
            totalSpendInPaise: d.totalSpend,
            firstOrderAt: d.firstDate.toISOString(),
            lastOrderAt: d.lastDate.toISOString(),
            tier,
            city: d.address?.city,
            state: d.address?.state,
            postalCode: d.address?.postalCode,
            addressLine: d.address?.addressLine,
            createdAt: d.firstDate.toISOString(),
          };
        });

        // Merge with mock customers (ensuring mock customers are available if database has few orders)
        const emailSet = new Set(dbCustomers.map((c) => c.email.toLowerCase()));
        const uniqueMocks = MOCK_CUSTOMERS.filter((m) => !emailSet.has(m.email.toLowerCase()));
        customers = [...dbCustomers, ...uniqueMocks];
      } catch {
        customers = [...MOCK_CUSTOMERS];
      }
    } else {
      customers = [...MOCK_CUSTOMERS];
    }

    // Apply filters
    if (query.search && query.search.trim()) {
      const q = query.search.trim().toLowerCase();
      customers = customers.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          c.email.toLowerCase().includes(q) ||
          c.phone.toLowerCase().includes(q) ||
          (c.city && c.city.toLowerCase().includes(q)),
      );
    }

    if (query.tier && query.tier !== 'all') {
      customers = customers.filter((c) => c.tier === query.tier);
    }

    const total = customers.length;
    const paginated = customers.slice(skip, skip + limit);

    return {
      customers: paginated,
      meta: buildPaginationMeta(page, limit, total),
    };
  },

  async getCustomerById(idOrEmail: string) {
    const clean = idOrEmail.trim().toLowerCase();
    const { customers } = await this.listCustomers({ limit: 100 });
    const customer = customers.find((c) => c.id === clean || c.email.toLowerCase() === clean);

    if (!customer) {
      throw new NotFoundError(`Customer '${idOrEmail}' not found.`, 'CUSTOMER_NOT_FOUND');
    }

    let customerOrders: unknown[] = [];
    if (mongoose.connection.readyState === 1) {
      try {
        customerOrders = await Order.find({ 'customer.email': customer.email }).sort({ createdAt: -1 }).lean();
      } catch {
        customerOrders = [];
      }
    }

    return {
      customer,
      orders: customerOrders,
      sustainabilityImpact: {
        garmentsSaved: Math.max(1, customer.totalOrders * 2),
        co2AvoidedKg: Number((customer.totalOrders * 3.4).toFixed(1)),
        waterSavedLitres: customer.totalOrders * 1800,
      },
    };
  },
};

