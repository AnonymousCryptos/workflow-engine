import express from "express";
import dotenv from "dotenv";

import { getPool } from "./config/database.js";
import workflowRoutes from "./routes/workflow.routes.js";

dotenv.config();

const app = express();
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

// Register workflow routes
app.use("/api/v1/workflows", workflowRoutes);

export default app;