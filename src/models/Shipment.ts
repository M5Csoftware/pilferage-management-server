import mongoose, { Schema, Document } from 'mongoose';

export interface IShipment extends Document {
  shipmentCode: string;
  trackingNumber: string;
  senderName: string;
  recipientName: string;
  origin: string;
  destination: string;
  category: 'Electronics' | 'High-Value' | 'Apparel' | 'Perishables' | 'General Freight';
  itemsCount: number;
  tolerancePercentage: number;
  
  // Inbound arrival
  inboundDate: Date;
  weightInKg: number;
  inboundOperator: string;
  inboundNotes?: string;
  sealNumberIn?: string;

  // Outbound dispatch
  outboundDate?: Date;
  weightOutKg?: number;
  outboundOperator?: string;
  sealNumberOut?: string;
  outboundNotes?: string;

  // Pilferage calculation & status
  status: 'INBOUND_RECORDED' | 'DISPATCH_VERIFIED' | 'PILFERAGE_FLAGGED' | 'DISPATCHED_CLEARED';
  weightDiffKg?: number;
  weightLossPercentage?: number;
  flaggedReason?: string;

  createdAt: Date;
  updatedAt: Date;
}

const ShipmentSchema = new Schema<IShipment>(
  {
    shipmentCode: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true,
    },
    trackingNumber: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true,
    },
    senderName: {
      type: String,
      required: true,
      trim: true,
    },
    recipientName: {
      type: String,
      required: true,
      trim: true,
    },
    origin: {
      type: String,
      default: 'Warehouse Hub',
    },
    destination: {
      type: String,
      required: true,
    },
    category: {
      type: String,
      enum: ['Electronics', 'High-Value', 'Apparel', 'Perishables', 'General Freight'],
      default: 'General Freight',
    },
    itemsCount: {
      type: Number,
      default: 1,
    },
    tolerancePercentage: {
      type: Number,
      default: 1.0, // default 1% tolerance
    },

    // Inbound
    inboundDate: {
      type: Date,
      default: Date.now,
    },
    weightInKg: {
      type: Number,
      required: true,
      min: 0.01,
    },
    inboundOperator: {
      type: String,
      default: 'Station Operator',
    },
    inboundNotes: {
      type: String,
    },
    sealNumberIn: {
      type: String,
    },

    // Outbound
    outboundDate: {
      type: Date,
    },
    weightOutKg: {
      type: Number,
      min: 0,
    },
    outboundOperator: {
      type: String,
    },
    sealNumberOut: {
      type: String,
    },
    outboundNotes: {
      type: String,
    },

    // Status & Audit
    status: {
      type: String,
      enum: ['INBOUND_RECORDED', 'DISPATCH_VERIFIED', 'PILFERAGE_FLAGGED', 'DISPATCHED_CLEARED'],
      default: 'INBOUND_RECORDED',
      index: true,
    },
    weightDiffKg: {
      type: Number,
    },
    weightLossPercentage: {
      type: Number,
    },
    flaggedReason: {
      type: String,
    },
  },
  {
    timestamps: true,
  }
);

export const ShipmentModel = mongoose.model<IShipment>('Shipment', ShipmentSchema);
