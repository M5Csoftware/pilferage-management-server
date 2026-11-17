# PMS - Pilferage Management Server

Node.js + Fastify backend API for the **Pilferage Management System (PMS)** with MongoDB.

Tracks arrival (inbound) weights vs. departure (outbound dispatch) weights to catch cargo theft and unauthorized parcel content removal before goods leave the facility.

---

## 🛠 Tech Stack
- **Runtime**: Node.js
- **Framework**: Fastify v5
- **Database / ODM**: MongoDB + Mongoose v8
- **Validation**: Zod
- **Documentation**: Swagger UI (`/docs`)
- **Security**: Fastify Helmet & Fastify CORS
- **Hosting Target**: Render

---

## 🚀 Quick Start (Local Development)

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Configure Environment Variables**:
   Copy `.env.example` to `.env`:
   ```env
   PORT=5000
   HOST=0.0.0.0
   NODE_ENV=development
   MONGODB_URI=mongodb://localhost:27017/pms_database
   CORS_ORIGIN=*
   ```

3. **Run in development mode**:
   ```bash
   npm run dev
   ```

4. **Production Build & Start**:
   ```bash
   npm run build
   npm start
   ```

---

## 🌐 API Endpoints

- **Health Check**: `GET /health` (Used by Render health monitoring)
- **Interactive Swagger Docs**: `GET /docs`
- **Shipments**:
  - `GET /api/shipments`: List all shipments (supports `?status=`, `?search=`, `?limit=`, `?page=`)
  - `GET /api/shipments/metrics/overview`: Total parcels, safe clearances, active pilferage flags, and cumulative kg deficit
  - `GET /api/shipments/:idOrTracking`: Retrieve a specific shipment by ID or tracking number
  - `POST /api/shipments/inbound`: Record initial arrival weight and lock security seal
  - `POST /api/shipments/:id/dispatch-check`: Re-weigh on dispatch, calculate variance percentage against tolerance limit, and determine clearance vs. pilferage security hold

---

## ☁️ Deployment on Render

1. Create a new **Web Service** on Render pointing to this repository.
2. Configure settings:
   - **Environment**: `Node`
   - **Build Command**: `npm install && npm run build`
   - **Start Command**: `npm start`
3. Add Environment Variables in Render:
   - `PORT`: `10000` (Render default or automatic)
   - `NODE_ENV`: `production`
   - `MONGODB_URI`: `<Your MongoDB Atlas Connection String>`
   - `CORS_ORIGIN`: `*` (or your Vercel frontend URL once deployed)
4. Health Check Path: `/health`
