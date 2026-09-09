import express from "express";
import dotenv from "dotenv";
import cors from "cors";

import { getPool } from "./config/database.js";
import workflowRoutes from "./routes/workflow.routes.js";
import masterRoutes from "./routes/master.routes.js";
import authRoutes from "./routes/auth.routes.js";
import { authenticate } from "./middleware/auth.middleware.js";
import adminRoutes from "./routes/admin.routes.js";
import reportRoutes from "./routes/report.routes.js";

dotenv.config();

const app = express();
app.use(cors({
    origin: process.env.FRONTEND_URL
}));
app.use(express.json());

app.get("/", async (req, res) => {
    try {
        const pool = getPool();

        await pool.query("SELECT 1");

        res.json({
            application: "Workflow Engine",
            status: "Running",
            database: "Connected"
        });
    } catch (error) {
        console.error(error);

        res.status(500).json({
            application: "Workflow Engine",
            status: "Running",
            database: "Disconnected",
            error: error.message
        });
    }
});

app.use(
    "/api/v1/auth",
    authRoutes
);

// Register workflow routes
app.use("/api/v1/workflows", authenticate, workflowRoutes);

app.use("/api/v1/masters", authenticate, masterRoutes);
app.use("/api/v1/admin", adminRoutes);

app.use(
    "/api/v1/reports",
    authenticate,
    reportRoutes
);

export default app;