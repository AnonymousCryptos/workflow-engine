import express from "express";

import {
    getStock,
    getStockSummary
} from "../controllers/stock.controller.js";

import {
    authenticate
} from "../middleware/auth.middleware.js";

const router =
    express.Router();

router.get(
    "/summary",
    authenticate,
    getStockSummary
);

router.get(
    "/",
    authenticate,
    getStock
);

export default router;