import express from "express";
import multer from "multer";

import {
    getStock,
    getStockSummary,
    createStockPickingPlan,
    getStockPickingPlanById,
    downloadStockPickingPlanReport
} from "../controllers/stock.controller.js";

import {
    authenticate
} from "../middleware/auth.middleware.js";


const router =
    express.Router();


const upload =
    multer({
        storage:
            multer.memoryStorage(),

        limits: {
            fileSize:
                10 * 1024 * 1024
        }
    });


router.get(
    "/summary",
    authenticate,
    getStockSummary
);


router.post(
    "/picker",
    authenticate,
    upload.single("file"),
    createStockPickingPlan
);

router.get(
    "/picker/:planId/report",
    authenticate,
    downloadStockPickingPlanReport
);

router.get(
    "/picker/:planId",
    authenticate,
    getStockPickingPlanById
);


router.get(
    "/",
    authenticate,
    getStock
);


router.use(
    (
        error,
        req,
        res,
        next
    ) => {
        if (
            error instanceof
                multer.MulterError &&
            error.code ===
                "LIMIT_FILE_SIZE"
        ) {
            return res.status(400).json({
                success: false,
                message:
                    "File size cannot exceed 10 MB."
            });
        }

        next(error);
    }
);


export default router;