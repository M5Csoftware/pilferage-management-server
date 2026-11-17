import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { ShipmentModel } from '../models/Shipment.js';

const RecordInboundSchema = z.object({
  shipmentCode: z.string().optional(),
  trackingNumber: z.string().min(1, 'Tracking number is required'),
  senderName: z.string().min(1, 'Sender name is required'),
  recipientName: z.string().min(1, 'Recipient name is required'),
  origin: z.string().optional(),
  destination: z.string().min(1, 'Destination is required'),
  category: z.enum(['Electronics', 'High-Value', 'Apparel', 'Perishables', 'General Freight']).default('General Freight'),
  itemsCount: z.number().int().positive().default(1),
  tolerancePercentage: z.number().positive().default(1.0),
  weightInKg: z.number().positive('Arrival weight in kg must be greater than zero'),
  inboundOperator: z.string().default('Station Operator'),
  sealNumberIn: z.string().optional(),
  inboundNotes: z.string().optional(),
});

const RecordOutboundDispatchSchema = z.object({
  weightOutKg: z.number().positive('Dispatch weight in kg must be greater than zero'),
  outboundOperator: z.string().default('Dispatch Officer'),
  sealNumberOut: z.string().optional(),
  outboundNotes: z.string().optional(),
  forceOverride: z.boolean().optional().default(false), // Optional supervisor override
});

export async function shipmentRoutes(fastify: FastifyInstance) {
  // 1. Get all shipments with optional filters
  fastify.get('/', async (request: FastifyRequest<{
    Querystring: { status?: string; search?: string; limit?: string; page?: string }
  }>, reply: FastifyReply) => {
    try {
      const { status, search, limit = '50', page = '1' } = request.query;
      const query: Record<string, any> = {};

      if (status && status !== 'ALL') {
        query.status = status;
      }

      if (search) {
        query.$or = [
          { trackingNumber: { $regex: search, $options: 'i' } },
          { shipmentCode: { $regex: search, $options: 'i' } },
          { senderName: { $regex: search, $options: 'i' } },
          { recipientName: { $regex: search, $options: 'i' } },
        ];
      }

      const limitNum = parseInt(limit, 10);
      const pageNum = parseInt(page, 10);
      const skip = (pageNum - 1) * limitNum;

      const [shipments, total] = await Promise.all([
        ShipmentModel.find(query).sort({ createdAt: -1 }).skip(skip).limit(limitNum).lean(),
        ShipmentModel.countDocuments(query),
      ]);

      return reply.send({
        success: true,
        data: shipments,
        meta: {
          total,
          page: pageNum,
          limit: limitNum,
          totalPages: Math.ceil(total / limitNum),
        },
      });
    } catch (err: any) {
      request.log.error(err);
      return reply.status(500).send({ success: false, message: 'Failed to retrieve shipments', error: err.message });
    }
  });

  // 2. Get metrics overview for dashboard
  fastify.get('/metrics/overview', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const [total, flagged, cleared, pending] = await Promise.all([
        ShipmentModel.countDocuments(),
        ShipmentModel.countDocuments({ status: 'PILFERAGE_FLAGGED' }),
        ShipmentModel.countDocuments({ status: 'DISPATCHED_CLEARED' }),
        ShipmentModel.countDocuments({ status: 'INBOUND_RECORDED' }),
      ]);

      const lossAgg = await ShipmentModel.aggregate([
        { $match: { status: 'PILFERAGE_FLAGGED', weightDiffKg: { $lt: 0 } } },
        { $group: { _id: null, totalLossKg: { $sum: { $abs: '$weightDiffKg' } } } },
      ]);

      return reply.send({
        success: true,
        data: {
          totalShipments: total,
          pilferageFlagged: flagged,
          dispatchedCleared: cleared,
          pendingWeighOut: pending,
          totalSuspectedLossKg: lossAgg.length > 0 ? +lossAgg[0].totalLossKg.toFixed(2) : 0,
        },
      });
    } catch (err: any) {
      request.log.error(err);
      return reply.status(500).send({ success: false, message: 'Failed to compute metrics', error: err.message });
    }
  });

  // 3. Get single shipment by ID or Tracking Number
  fastify.get('/:idOrTracking', async (request: FastifyRequest<{ Params: { idOrTracking: string } }>, reply: FastifyReply) => {
    try {
      const { idOrTracking } = request.params;
      const shipment = await ShipmentModel.findOne({
        $or: [{ _id: idOrTracking.match(/^[0-9a-fA-F]{24}$/) ? idOrTracking : null }, { shipmentCode: idOrTracking }, { trackingNumber: idOrTracking }],
      }).lean();

      if (!shipment) {
        return reply.status(404).send({ success: false, message: 'Shipment not found' });
      }

      return reply.send({ success: true, data: shipment });
    } catch (err: any) {
      request.log.error(err);
      return reply.status(500).send({ success: false, message: 'Failed to retrieve shipment', error: err.message });
    }
  });

  // 4. Inbound Step: Record initial weight in
  fastify.post('/inbound', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const parseResult = RecordInboundSchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.status(400).send({
          success: false,
          message: 'Invalid inbound payload',
          errors: parseResult.error.issues,
        });
      }

      const body = parseResult.data;
      const shipmentCode = body.shipmentCode || `SHP-${Math.floor(10000 + Math.random() * 90000)}`;

      const newShipment = new ShipmentModel({
        ...body,
        shipmentCode,
        inboundDate: new Date(),
        status: 'INBOUND_RECORDED',
      });

      const saved = await newShipment.save();
      return reply.status(201).send({
        success: true,
        message: 'Inbound weight successfully recorded and locked',
        data: saved,
      });
    } catch (err: any) {
      request.log.error(err);
      if (err.code === 11000) {
        return reply.status(409).send({
          success: false,
          message: 'A shipment with this tracking number or code already exists',
        });
      }
      return reply.status(500).send({ success: false, message: 'Error recording inbound shipment', error: err.message });
    }
  });

  // 5. Outbound Step: Cross-check weight and verify dispatch (or flag pilferage)
  fastify.post('/:id/dispatch-check', async (request: FastifyRequest<{
    Params: { id: string };
  }>, reply: FastifyReply) => {
    try {
      const { id } = request.params;
      const parseResult = RecordOutboundDispatchSchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.status(400).send({
          success: false,
          message: 'Invalid outbound dispatch payload',
          errors: parseResult.error.issues,
        });
      }

      const { weightOutKg, outboundOperator, sealNumberOut, outboundNotes, forceOverride } = parseResult.data;

      const shipment = await ShipmentModel.findOne({
        $or: [{ _id: id.match(/^[0-9a-fA-F]{24}$/) ? id : null }, { shipmentCode: id }, { trackingNumber: id }],
      });

      if (!shipment) {
        return reply.status(404).send({ success: false, message: 'Shipment not found' });
      }

      // Core Pilferage Engine Algorithm:
      // Compare arrival weight (weightInKg) against dispatch weight (weightOutKg)
      const diffKg = +(weightOutKg - shipment.weightInKg).toFixed(2);
      const lossPercentage = +((diffKg / shipment.weightInKg) * 100).toFixed(2);
      const isDeficit = diffKg < 0;
      const absLossPercentage = Math.abs(lossPercentage);

      const exceedsTolerance = isDeficit && absLossPercentage > shipment.tolerancePercentage;

      shipment.weightOutKg = weightOutKg;
      shipment.outboundDate = new Date();
      shipment.outboundOperator = outboundOperator;
      shipment.sealNumberOut = sealNumberOut || shipment.sealNumberIn;
      shipment.weightDiffKg = diffKg;
      shipment.weightLossPercentage = lossPercentage;
      shipment.outboundNotes = outboundNotes;

      if (exceedsTolerance && !forceOverride) {
        shipment.status = 'PILFERAGE_FLAGGED';
        shipment.flaggedReason = `PILFERAGE DETECTED: Outbound parcel weighs ${Math.abs(diffKg)} kg less than arrival baseline (${absLossPercentage}% loss). Permissible threshold is ${shipment.tolerancePercentage}%. Cargo held for security audit.`;
      } else {
        shipment.status = 'DISPATCHED_CLEARED';
        if (forceOverride) {
          shipment.flaggedReason = 'Supervisor manual clearance override applied.';
        }
      }

      const updated = await shipment.save();

      return reply.send({
        success: true,
        pilferageDetected: exceedsTolerance,
        status: shipment.status,
        variance: {
          weightInKg: shipment.weightInKg,
          weightOutKg,
          weightDiffKg: diffKg,
          lossPercentage,
          tolerancePercentage: shipment.tolerancePercentage,
          exceedsTolerance,
        },
        data: updated,
      });
    } catch (err: any) {
      request.log.error(err);
      return reply.status(500).send({ success: false, message: 'Error checking dispatch weight', error: err.message });
    }
  });
}
